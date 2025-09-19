const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
// Load env based on NODE_ENV (defaults to development)
const env = process.env.NODE_ENV || 'development';
require('dotenv').config(); // base .env if present
require('dotenv').config({ path: `.env.${env}` });

const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render/Proxy headers so client IP is read from X-Forwarded-For
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());

// CORS configuration with support for comma-separated origins and optional regex
// Example: ALLOWED_ORIGINS="https://*.onrender.com,https://my-site.com"
const rawAllowed = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000';
const allowedOrigins = rawAllowed
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(pattern => {
        if (pattern === '*' || pattern === 'ALL') return '*';
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            try { return new RegExp(pattern.slice(1, -1)); } catch { return null; }
        }
        if (pattern.includes('*')) {
            // Convert simple wildcard to regex: https://*.onrender.com -> ^https://.*\.onrender\.com$
            const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            return new RegExp(`^${escaped}$`);
        }
        return pattern;
    })
    .filter(Boolean);

const isOriginAllowed = (origin) => {
    for (const rule of allowedOrigins) {
        if (rule === '*') return true;
        if (rule instanceof RegExp && rule.test(origin)) return true;
        if (typeof rule === 'string' && rule === origin) return true;
    }
    return false;
};

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100)
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Backward-compatible aliases (handle clients missing the /api prefix)
app.use('/auth', authRoutes);
app.use('/chat', chatRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'AI Customer Support API is running',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            chat: '/api/chat'
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'AI Customer Support API is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler (must come after routes)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
