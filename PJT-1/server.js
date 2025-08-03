const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const { User, Note, Message } = require('./models');
const { generateToken, hashPassword, comparePassword, authenticateToken, requireAdmin } = require('./auth');
const googleDrive = require('./googleDrive');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' } 
});

const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Database Connection and Data Initialization ---
const initializeData = async () => {
    try {
        // Create fixed users in database if they don't exist
        const fixedUsers = [
            { name: 'Samayank', email: 'samayank@example.com', password: 'Goel', role: 'admin' },
            { name: 'Sarthak', email: 'sarthak@example.com', password: 'Luhadia', role: 'imaging' },
            { name: 'Daksh', email: 'daksh@example.com', password: 'Singla', role: 'genomics' },
            { name: 'Dr. Logeshwari G', email: 'logeshwari@example.com', password: 'admin', role: 'integration' }
        ];

        for (const userData of fixedUsers) {
            const existingUser = await User.findOne({ email: userData.email });
            if (!existingUser) {
                await User.create(userData);
                console.log(`Created user: ${userData.name}`);
            }
        }

        console.log('Database connection established and users initialized');
    } catch (error) {
        console.error('Error initializing data:', error);
    }
};

// Connect to MongoDB and initialize data
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected successfully');
        return initializeData();
    })
    .catch(err => console.error('MongoDB connection error:', err));

// --- Initialize Google Drive ---
googleDrive.initialize();

// --- Daily Chat Backup (runs at 2 AM) ---
setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 2 && now.getMinutes() === 0) {
        console.log('Running daily chat backup...');
        const messages = await Message.find().populate('sender', 'name');
        await googleDrive.dailyBackup(messages);
    }
}, 60000); // Check every minute

// --- Fixed Users ---
const FIXED_USERS = [
  { _id: '1', name: 'Samayank', password: 'Goel' },
  { _id: '2', name: 'Sarthak', password: 'Luhadia' },
  { _id: '3', name: 'Daksh', password: 'Singla' },
  { _id: '4', name: 'Dr. Logeshwari G', password: 'admin' }
];

// Helper to get user by id
async function getUserById(id) {
  // First try to find in database by email (using the fixed user mapping)
  const userMap = {
    '1': 'samayank@example.com',
    '2': 'sarthak@example.com', 
    '3': 'daksh@example.com',
    '4': 'logeshwari@example.com'
  };
  
  const email = userMap[id];
  if (email) {
    const dbUser = await User.findOne({ email });
    if (dbUser) {
      return {
        _id: dbUser._id.toString(),
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role
      };
    }
  }
  
  // Fallback to fixed users array
  return FIXED_USERS.find(u => u._id === id);
}

// --- API Routes ---

// Users endpoint
app.get('/api/users', (req, res) => {
  res.json(FIXED_USERS);
});

// Notes endpoint
app.get('/api/notes', async (req, res) => {
  try {
    // Always fetch from database to ensure we have the latest notes
    const notes = await Note.find().populate('author', 'name');
    const formattedNotes = notes.map(note => ({
      id: note._id.toString(),
      authorId: note.author._id.toString(),
      title: note.title,
      content: note.content,
      phase: note.phase,
      tags: note.tags,
      isCompleted: note.isCompleted,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      author: note.author
    }));
    res.json(formattedNotes);
  } catch (e) {
    console.error('Error fetching notes:', e);
    res.status(500).json({ error: 'Failed to fetch notes from database' });
  }
});

app.post('/api/notes', async (req, res) => {
  try {
    const { authorId, title, content, phase, tags } = req.body;
    const author = await getUserById(authorId);
    if (!author || !title || !content) return res.status(400).json({ error: 'Invalid data' });
    
    // Save to DB using the MongoDB ObjectId from the database user
    const dbNote = await Note.create({
      author: author._id, // This should now be a valid MongoDB ObjectId
      title,
      content,
      phase: phase || 'general',
      tags: tags || []
    });
    
    // Populate the author field for the response
    const populatedNote = await Note.findById(dbNote._id).populate('author', 'name _id');
    
    // Return the formatted note
    const note = {
      id: dbNote._id.toString(),
      authorId: author._id,
      author: {
        _id: author._id,
        name: author.name
      },
      title,
      content,
      phase: phase || 'general',
      tags: tags || [],
      createdAt: dbNote.createdAt,
      updatedAt: dbNote.updatedAt
    };
    
    res.status(201).json(note);
  } catch (e) {
    console.error('Error creating note:', e);
    res.status(400).json({ error: 'Failed to create note.' });
  }
});

// Delete a single note by ID
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await Note.deleteOne({ _id: id });
    if (result.deletedCount > 0) {
      res.json({ success: true, message: 'Note deleted.' });
    } else {
      res.status(404).json({ error: 'Note not found.' });
    }
  } catch (e) {
    console.error('Error deleting note:', e);
    res.status(500).json({ error: 'Failed to delete note from database.' });
  }
});

// Chat Routes (no auth)
app.get('/api/chat/:channel', async (req, res) => {
  const { channel } = req.params;
  try {
    // Always fetch from database to ensure we have the latest messages
    const messages = await Message.find({ channel }).populate('sender', 'name _id');
    
    // Transform messages to include consistent structure
    const formattedMessages = messages.map(msg => ({
      id: msg._id.toString(),
      senderId: msg.sender._id.toString(),
      content: msg.content,
      channel: msg.channel,
      createdAt: msg.createdAt,
      sender: {
        _id: msg.sender._id,
        name: msg.sender.name
      }
    }));
    
    res.json(formattedMessages);
  } catch (e) {
    console.error('Error fetching chat messages:', e);
    res.status(500).json({ error: 'Failed to fetch chat messages from database' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { senderId, content, channel } = req.body;
  const sender = await getUserById(senderId);
  if (!sender || !content || !channel) return res.status(400).json({ error: 'Invalid data' });
  try {
    // Save to DB using the MongoDB ObjectId from the database user
    const dbMsg = await Message.create({
      sender: sender._id, // This should now be a valid MongoDB ObjectId
      content,
      channel
    });
    
    // Populate the sender information for the response
    const populatedMsg = await Message.findById(dbMsg._id).populate('sender', 'name _id');
    
    // Create message object with full sender information
    const msg = {
      id: dbMsg._id.toString(),
      senderId: sender._id,
      sender: {
        _id: sender._id,
        name: sender.name
      },
      content,
      channel,
      createdAt: dbMsg.createdAt
    };
    
    res.json(msg);
  } catch (e) {
    console.error('Error creating chat message:', e);
    res.status(500).json({ error: 'Failed to save chat message.' });
  }
});

// Gemini Proxy
app.post('/api/gemini', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        console.log('Gemini API call - Prompt:', prompt);
        console.log('API Key present:', !!process.env.GEMINI_API_KEY);
        console.log('API Key length:', process.env.GEMINI_API_KEY?.length);
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Get API key from environment variable
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            console.log('No API key found in environment');
            return res.status(500).json({ error: 'API key not configured' });
        }

        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        console.log('Making request to Gemini API...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('Gemini API response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Gemini API error response:', errorText);
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Gemini API success - response received');
        res.json(result);

    } catch (error) {
        console.error('Gemini API call failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Simple login endpoint for fixed users
app.post('/api/login', (req, res) => {
  const { name, password } = req.body;
  console.log('Login attempt:', { name, password });
  const user = FIXED_USERS.find(u => u.name === name && u.password === password);
  console.log('User found:', user);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  // Don't send password back
  const { password: _, ...userNoPass } = user;
  res.json(userNoPass);
});

// Serve HTML File
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Socket.IO Connection (no auth, use userId from handshake query) ---
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  let user = null;
  
  // Get user info asynchronously
  getUserById(userId).then(userData => {
    if (!userData) {
      socket.disconnect();
      return;
    }
    user = userData;
    socket.user = user;
    console.log(`User connected: ${user.name}`);
  }).catch(err => {
    console.error('Error getting user:', err);
    socket.disconnect();
  });

  socket.on('join_channel', async (channel) => {
    socket.join(channel);
    try {
      // Fetch messages from database for this channel
      const messages = await Message.find({ channel }).populate('sender', 'name _id');
      const formattedMessages = messages.map(msg => ({
        id: msg._id.toString(),
        senderId: msg.sender._id.toString(),
        content: msg.content,
        channel: msg.channel,
        createdAt: msg.createdAt,
        sender: {
          _id: msg.sender._id,
          name: msg.sender.name
        }
      }));
      socket.emit('message_history', formattedMessages);
    } catch (error) {
      console.error('Error fetching message history:', error);
      socket.emit('message_history', []);
    }
  });

  socket.on('new_message', async (data) => {
    const { content, channel } = data;
    if (!content || !channel || !user) return;
    
    try {
      // Save message to database using the MongoDB ObjectId
      const dbMsg = await Message.create({
        sender: user._id, // This should now be a valid MongoDB ObjectId
        content,
        channel
      });
      
      const msg = {
        id: dbMsg._id.toString(),
        senderId: user._id,
        content,
        channel,
        createdAt: dbMsg.createdAt,
        sender: user
      };
      
      io.to(channel).emit('receive_message', msg);
    } catch (error) {
      console.error('Error saving new message:', error);
    }
  });

  socket.on('disconnect', () => {
    if (user) {
      console.log(`User disconnected: ${user.name}`);
    }
  });
});

// --- Admin/Test Endpoints to Clear Notes and Chats ---
app.post('/api/clear-notes', async (req, res) => {
  try {
    await Note.deleteMany({});
    res.json({ success: true, message: 'All notes cleared.' });
  } catch (e) {
    console.error('Error clearing notes:', e);
    res.status(500).json({ error: 'Failed to clear notes from database.' });
  }
});

app.post('/api/clear-chat', async (req, res) => {
  try {
    await Message.deleteMany({});
    res.json({ success: true, message: 'All chat messages cleared.' });
  } catch (e) {
    console.error('Error clearing chat messages:', e);
    res.status(500).json({ error: 'Failed to clear chat messages from database.' });
  }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
