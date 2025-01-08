const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = 3004;
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt'); // Add this for password hashing

// Environment variables (should be in .env file)
const SALT_ROUNDS = 10;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

// Configure multer with proper file naming
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection with proper error handling
mongoose.connect('mongodb://127.0.0.1:17017/KITS-SOC-ProjectLibrary', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if cannot connect to database
});

// Enhanced User Schema with password hashing
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    registerNo: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Project Schema with validation
const projectSchema = new mongoose.Schema({
    projectName: { 
        type: String, 
        required: true,
        trim: true 
    },
    passedOutYear: { 
        type: Number, 
        required: true,
        min: 2000,
        max: new Date().getFullYear() + 4
    },
    teamMembers: [{
        name: { type: String, required: true, trim: true },
        registerNo: { type: String, required: true, trim: true }
    }],
    projectGuide: {
        name: { type: String, required: true, trim: true },
        degree: { type: String, required: true, trim: true }
    },
    projectFile: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Project = mongoose.model('Project', projectSchema);

app.get("/", (req, res) => {
  res.send("API server is running");
});

// Enhanced project upload endpoint with proper error handling
app.post('/admin/projects', upload.single('projectFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Project file is required.' });
        }

        const teamMembers = [];
        for (let i = 1; i <= 5; i++) {
            const name = req.body[`teamMember${i}Name`];
            const registerNo = req.body[`teamMember${i}RegNo`];
            if (name && registerNo) {
                teamMembers.push({ name, registerNo });
            }
        }

        const newProject = new Project({
            projectName: req.body.projectName,
            passedOutYear: parseInt(req.body.passedOutYear),
            teamMembers,
            projectGuide: {
                name: req.body.projectGuideName,
                degree: req.body.projectGuideDegree
            },
            projectFile: req.file.filename
        });

        await newProject.save();
        res.json({ 
            success: true, 
            message: 'Project added successfully!', 
            project: newProject 
        });

    } catch (error) {
        // Delete uploaded file if project save fails
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Error adding project', 
            error: error.message 
        });
    }
});

// Enhanced login route with password validation
// POST /login - User Login
app.post('/login', async (req, res) => {
    try {
        const { registerNo, password } = req.body;
        const user = await User.findOne({ registerNo });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Login successful',
            user: {
                email: user.email,
                registerNo: user.registerNo
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// POST /register - User Registration
app.post('/register', async (req, res) => {
    try {
        const { email, registerNo, password } = req.body;

        // Check if email or registerNo already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { registerNo }]
        });

        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email or Register number already in use' 
            });
        }

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const newUser = new User({
            email,
            registerNo,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({ 
            success: true, 
            message: 'Registration successful',
            user: {
                email: newUser.email,
                registerNo: newUser.registerNo
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});


// Protected route to get all projects
app.get('/projects', async (req, res) => {
    try {
        const projects = await Project.find().sort({ createdAt: -1 });
        res.json({ success: true, projects });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching projects',
            error: error.message 
        });
    }
});

// Enhanced admin login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const adminCredentials = {
        email: 'adminIT@gmail.com',
        password: 'ITprojectsKITS'
    };

    try {
        if (username === adminCredentials.email && password === adminCredentials.password) {
            res.json({
                success: true,
                message: 'Admin login successful'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});



// Fetch projects by year
app.get('/projects/:year', async (req, res) => {
    try {
        const { year } = req.params; // Get year from URL params
        const projects = await Project.find({ passedOutYear: year });
        
        if (!projects || projects.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No projects found for the given year',
            });
        }

        res.json({
            success: true,
            projects,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
});


app.get('/project/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findById(id);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        res.json({
            success: true,
            project,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
