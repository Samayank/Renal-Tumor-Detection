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

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully'))
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
  { _id: '3', name: 'Daksh', password: 'Singla' }
];

// Helper to get user by id
function getUserById(id) {
  return FIXED_USERS.find(u => u._id === id);
}

// --- API Routes ---

// Users endpoint
app.get('/api/users', (req, res) => {
  res.json(FIXED_USERS);
});

// Notes Routes (no auth)
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await Note.find().populate('author', 'name');
    res.json(notes.map(note => ({
      ...note.toObject(),
      author: note.author
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});

app.post('/api/notes', async (req, res) => {
  try {
    const { authorId, title, content, phase, tags } = req.body;
    const author = getUserById(authorId);
    if (!author || !title || !content) return res.status(400).json({ error: 'Invalid data' });
    // Save to DB
    const dbNote = await Note.create({
      author: authorId,
      title,
      content,
      phase,
      tags
    });
    // Save to memory for legacy compatibility
    if (!global.notes) global.notes = [];
    const note = {
      id: dbNote._id.toString(),
      authorId,
      title,
      content,
      phase,
      tags,
      createdAt: dbNote.createdAt
    };
    global.notes.unshift(note);
    res.status(201).json({ ...note, author });
  } catch (e) {
    res.status(400).json({ error: 'Failed to create note.' });
  }
});

// Delete a single note by ID
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  if (!global.notes) global.notes = [];
  const initialLength = global.notes.length;
  global.notes = global.notes.filter(note => note.id !== id);
  try {
    await Note.deleteOne({ _id: id });
    if (global.notes.length < initialLength) {
      res.json({ success: true, message: 'Note deleted.' });
    } else {
      res.status(404).json({ error: 'Note not found.' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete note from database.' });
  }
});

// Chat Routes (no auth)
app.get('/api/chat/:channel', async (req, res) => {
  const { channel } = req.params;
  try {
    const messages = await Message.find({ channel }).populate('sender', 'name');
    res.json(messages.map(msg => ({
      ...msg.toObject(),
      sender: msg.sender
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch chat messages.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { senderId, content, channel } = req.body;
  const sender = getUserById(senderId);
  if (!sender || !content || !channel) return res.status(400).json({ error: 'Invalid data' });
  try {
    // Save to DB
    const dbMsg = await Message.create({
      sender: senderId,
      content,
      channel
    });
    // Save to memory for legacy compatibility
    if (!global.chatMessages) global.chatMessages = [];
    const msg = {
      id: dbMsg._id.toString(),
      senderId,
      content,
      channel,
      createdAt: dbMsg.createdAt
    };
    global.chatMessages.push(msg);
    res.json({ ...msg, sender });
  } catch (e) {
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
  const user = getUserById(userId);
  if (!user) {
    socket.disconnect();
    return;
  }
  socket.user = user;
  console.log(`User connected: ${user.name}`);

  socket.on('join_channel', (channel) => {
    socket.join(channel);
    if (!global.chatMessages) global.chatMessages = [];
    const messages = global.chatMessages.filter(msg => msg.channel === channel).map(msg => ({
      ...msg,
      sender: getUserById(msg.senderId)
    }));
    socket.emit('message_history', messages);
  });

  socket.on('new_message', (data) => {
    const { content, channel } = data;
    if (!content || !channel) return;
    if (!global.chatMessages) global.chatMessages = [];
    const msg = {
      id: String(Date.now()),
      senderId: user._id,
      content,
      channel,
      createdAt: new Date().toISOString()
    };
    global.chatMessages.push(msg);
    io.to(channel).emit('receive_message', { ...msg, sender: user });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${user.name}`);
  });
});

// --- Admin/Test Endpoints to Clear Notes and Chats ---
app.post('/api/clear-notes', async (req, res) => {
  global.notes = [];
  try {
    await Note.deleteMany({});
    res.json({ success: true, message: 'All notes cleared.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear notes from database.' });
  }
});
app.post('/api/clear-chat', async (req, res) => {
  global.chatMessages = [];
  try {
    await Message.deleteMany({});
    res.json({ success: true, message: 'All chat messages cleared.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear chat messages from database.' });
  }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
