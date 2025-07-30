const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'imaging', 'genomics', 'integration'],
        default: 'imaging'
    },
    isActive: {
        type: Boolean,
        default: false
    },
    inviteToken: String,
    inviteExpires: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Notes Schema
const noteSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    phase: {
        type: String,
        enum: ['foundations', 'data-acquisition', 'segmentation', 'ct-classification', 'genomic-classification', 'fusion', 'explainability', 'evaluation', 'dissemination', 'general'],
        default: 'general'
    },
    tags: [String],
    isCompleted: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Chat Messages Schema
const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'file', 'system'],
        default: 'text'
    },
    channel: {
        type: String,
        enum: ['general', 'imaging', 'genomics', 'integration'],
        default: 'general'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Export models
module.exports = {
    User: mongoose.model('User', userSchema),
    Note: mongoose.model('Note', noteSchema),
    Message: mongoose.model('Message', messageSchema)
};
