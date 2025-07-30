const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { User } = require('./models');

async function setupAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log('Admin user already exists:', existingAdmin.email);
            process.exit(0);
        }

        // Create admin user
        const adminEmail = process.argv[2] || 'admin@example.com';
        const adminPassword = process.argv[3] || 'admin123';
        const adminName = process.argv[4] || 'Admin User';

        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        
        const admin = new User({
            email: adminEmail,
            name: adminName,
            password: hashedPassword,
            role: 'admin',
            isActive: true
        });

        await admin.save();
        console.log(`Admin user created successfully!`);
        console.log(`Email: ${adminEmail}`);
        console.log(`Password: ${adminPassword}`);
        console.log(`\nYou can now login at: http://localhost:3000/login.html`);
        
    } catch (error) {
        console.error('Error setting up admin:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

setupAdmin();
