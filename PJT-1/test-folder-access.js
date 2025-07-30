const { google } = require('googleapis');
require('dotenv').config();

async function testFolderAccess() {
    try {
        console.log('🔍 Testing Google Drive folder access...\n');
        
        // Initialize Google Drive API
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const drive = google.drive({ version: 'v3', auth });
        
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        console.log(`📁 Testing folder ID: ${folderId}`);
        console.log(`🤖 Service account: ${credentials.client_email}\n`);
        
        // Test 1: Try to get folder metadata
        console.log('📋 Test 1: Getting folder metadata...');
        try {
            const folderInfo = await drive.files.get({
                fileId: folderId,
                fields: 'id, name, parents, owners, permissions',
                supportsAllDrives: true
            });
            
            console.log('✅ Folder found!');
            console.log(`   Name: ${folderInfo.data.name}`);
            console.log(`   ID: ${folderInfo.data.id}`);
            console.log(`   Parent(s): ${folderInfo.data.parents || 'None (root level)'}`);
        } catch (error) {
            console.log('❌ Cannot access folder metadata');
            console.log(`   Error: ${error.message}`);
            
            if (error.message.includes('File not found')) {
                console.log('\n🚨 Possible issues:');
                console.log('1. Folder ID is incorrect');
                console.log('2. Service account lacks access to the folder');
                console.log('3. Folder is not in a Shared Drive that includes the service account');
            }
        }
        
        // Test 2: Try to list shared drives
        console.log('\n📋 Test 2: Listing accessible shared drives...');
        try {
            const sharedDrives = await drive.drives.list();
            
            if (sharedDrives.data.drives && sharedDrives.data.drives.length > 0) {
                console.log('✅ Accessible shared drives:');
                sharedDrives.data.drives.forEach(drive => {
                    console.log(`   - ${drive.name} (ID: ${drive.id})`);
                });
            } else {
                console.log('❌ No shared drives accessible to this service account');
                console.log('   Make sure you\'ve added the service account to your shared drive!');
            }
        } catch (error) {
            console.log('❌ Cannot list shared drives');
            console.log(`   Error: ${error.message}`);
        }
        
        // Test 3: Try to create a test file
        console.log('\n📋 Test 3: Testing file creation...');
        try {
            const testFileMetadata = {
                name: 'test-connection.txt',
                parents: [folderId]
            };
            
            const testFile = await drive.files.create({
                resource: testFileMetadata,
                media: {
                    mimeType: 'text/plain',
                    body: 'This is a test file created by the service account.'
                },
                fields: 'id',
                supportsAllDrives: true
            });
            
            console.log('✅ Test file created successfully!');
            console.log(`   File ID: ${testFile.data.id}`);
            
            // Clean up - delete the test file
            await drive.files.delete({
                fileId: testFile.data.id,
                supportsAllDrives: true
            });
            console.log('🧹 Test file cleaned up');
            
        } catch (error) {
            console.log('❌ Cannot create test file');
            console.log(`   Error: ${error.message}`);
        }
        
    } catch (error) {
        console.error('❌ Error testing folder access:', error.message);
    }
}

// Instructions for user
console.log('🔧 Google Drive Folder Access Test');
console.log('=====================================');
console.log('This script will help diagnose folder access issues.\n');

console.log('📝 Setup checklist:');
console.log('1. ✓ Service account created');
console.log('2. ✓ Service account key downloaded and added to .env');
console.log('3. ? Shared drive created with service account added as member');
console.log('4. ? Correct folder ID copied from shared drive folder URL\n');

console.log('🤖 Your service account email:');
try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    console.log(`   ${credentials.client_email}`);
    console.log('\n⚠️  Make sure this email is added to your shared drive!\n');
} catch (error) {
    console.log('   Error reading service account email from .env file');
}

testFolderAccess();
