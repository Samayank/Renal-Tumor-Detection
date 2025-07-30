const googleDrive = require('./googleDrive');
const { Message, User } = require('./models');
const mongoose = require('mongoose');
require('dotenv').config();

async function testGoogleDriveBackup() {
    try {
        console.log('🔍 Testing Google Drive backup functionality...\n');
        
        // Check if Google Drive credentials are configured
        const hasCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY && 
                              process.env.GOOGLE_SERVICE_ACCOUNT_KEY !== 'undefined';
        
        console.log('📋 Configuration Check:');
        console.log('✓ Google Drive credentials configured:', hasCredentials ? 'YES' : 'NO');
        
        if (!hasCredentials) {
            console.log('\n🚨 Google Drive Setup Required:');
            console.log('1. Go to https://console.cloud.google.com/');
            console.log('2. Create a new project or select existing project');
            console.log('3. Enable Google Drive API');
            console.log('4. Create a Service Account');
            console.log('5. Generate and download JSON key file');
            console.log('6. Add the JSON content to your .env file as GOOGLE_SERVICE_ACCOUNT_KEY');
            console.log('\nFor now, I\'ll create a local backup system...\n');
            
            await createLocalBackupSystem();
            return;
        }
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB');
        
        // Initialize Google Drive
        await googleDrive.initialize();
        
        // Create test messages if none exist
        const messageCount = await Message.countDocuments();
        if (messageCount === 0) {
            console.log('📝 Creating test messages...');
            await createTestMessages();
        }
        
        // Test backup
        console.log('🔄 Testing backup process...');
        const messages = await Message.find().populate('sender', 'name');
        await googleDrive.dailyBackup(messages);
        
        console.log('✓ Google Drive backup test completed successfully!');
        
    } catch (error) {
        console.error('❌ Error testing Google Drive backup:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

async function createTestMessages() {
    // Create a test user if none exists
    let testUser = await User.findOne();
    if (!testUser) {
        testUser = new User({
            name: 'Test User',
            email: 'test@example.com',
            password: 'hashedpassword',
            role: 'admin',
            isActive: true
        });
        await testUser.save();
    }
    
    // Create test messages
    const testMessages = [
        { sender: testUser._id, content: 'Starting the segmentation work today!', channel: 'imaging' },
        { sender: testUser._id, content: 'Gene expression data looks promising', channel: 'genomics' },
        { sender: testUser._id, content: 'Integration of both models progressing well', channel: 'integration' },
        { sender: testUser._id, content: 'Daily standup: all on track!', channel: 'general' }
    ];
    
    for (const msgData of testMessages) {
        const message = new Message(msgData);
        await message.save();
    }
    
    console.log('✓ Created test messages');
}

async function createLocalBackupSystem() {
    console.log('🔧 Creating local backup system...');
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // Create local backup directory
    const backupDir = path.join(__dirname, 'chat-backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    // Connect to MongoDB and create backup
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const messages = await Message.find().populate('sender', 'name');
        
        if (messages.length === 0) {
            console.log('📝 No messages found. Creating test messages...');
            await createTestMessages();
            const newMessages = await Message.find().populate('sender', 'name');
            await createLocalBackup(newMessages, backupDir);
        } else {
            await createLocalBackup(messages, backupDir);
        }
        
        console.log(`✓ Local backup created in: ${backupDir}`);
        console.log('💡 You can manually upload these files to your Google Drive until API is set up');
        
    } catch (error) {
        console.error('❌ Error creating local backup:', error.message);
    }
}

async function createLocalBackup(messages, backupDir) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const channels = ['general', 'imaging', 'genomics', 'integration'];
    const timestamp = new Date().toISOString().split('T')[0];
    
    for (const channel of channels) {
        const channelMessages = messages.filter(msg => msg.channel === channel);
        if (channelMessages.length > 0) {
            const fileName = `chat-backup-${channel}-${timestamp}.json`;
            const filePath = path.join(backupDir, fileName);
            
            const backupData = {
                channel,
                timestamp: new Date().toISOString(),
                messagesCount: channelMessages.length,
                messages: channelMessages.map(msg => ({
                    sender: msg.sender.name,
                    content: msg.content,
                    messageType: msg.messageType,
                    createdAt: msg.createdAt
                }))
            };
            
            await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));
            console.log(`📁 Created: ${fileName}`);
        }
    }
}

// Run the test
testGoogleDriveBackup();
