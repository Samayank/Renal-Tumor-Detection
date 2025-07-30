const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleDriveService {
    constructor() {
        this.drive = null;
        this.folderId = null;
    }

    async initialize() {
        try {
            // Initialize Google Drive API
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/drive.file']
            });

            this.drive = google.drive({ version: 'v3', auth });
            
            // Set the project folder from environment variable
            await this.setProjectFolder();
            
            console.log('Google Drive service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google Drive service:', error.message);
        }
    }

    async setProjectFolder() {
        if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
            throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set in .env file');
        }
        this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    }

    async backupChatMessages(messages, channel = 'general') {
        if (!this.drive || !this.folderId) {
            console.log('Google Drive not initialized, skipping backup');
            return;
        }

        try {
            const timestamp = new Date().toISOString().split('T')[0];
            const fileName = `chat-backup-${channel}-${timestamp}.json`;
            
            // Create backup data
            const backupData = {
                channel,
                timestamp: new Date().toISOString(),
                messagesCount: messages.length,
                messages: messages.map(msg => ({
                    sender: msg.sender.name,
                    content: msg.content,
                    messageType: msg.messageType,
                    createdAt: msg.createdAt
                }))
            };

            // Create temporary file
            const tempFilePath = path.join(__dirname, 'temp', fileName);
            await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
            await fs.writeFile(tempFilePath, JSON.stringify(backupData, null, 2));

            // Upload to Google Drive
            const fileMetadata = {
                name: fileName,
                parents: [this.folderId]
            };

            const media = {
                mimeType: 'application/json',
                body: require('fs').createReadStream(tempFilePath)
            };

            await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id',
                supportsAllDrives: true
            });

            // Clean up temp file
            await fs.unlink(tempFilePath);
            
            console.log(`Chat backup uploaded: ${fileName}`);
        } catch (error) {
            console.error('Error backing up chat messages:', error.message);
        }
    }

    async dailyBackup(messages) {
        const channels = ['general', 'imaging', 'genomics', 'integration'];
        
        for (const channel of channels) {
            const channelMessages = messages.filter(msg => msg.channel === channel);
            if (channelMessages.length > 0) {
                await this.backupChatMessages(channelMessages, channel);
            }
        }
    }
}

module.exports = new GoogleDriveService();
