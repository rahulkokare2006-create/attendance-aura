const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'FRONTEND_URL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'PORT'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingEnvVars.join(', '));
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  // include deployed frontend domain commonly used by the project
  process.env.DEPLOYED_FRONTEND_URL || 'https://attendance.ambit.edu.in',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].filter(Boolean);

const isLocalhostOrigin = (origin) => {
  return Boolean(origin && /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/?$)/.test(origin));
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked by allowed origins: ${origin}`));
    }
  },
  credentials: true,
}));

// Socket.io for real-time attendance
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket.IO CORS blocked by allowed origins: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }
});
app.set("io", io);

app.use(express.json({ limit: "50mb" }));

// MongoDB Connection
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Waiting for reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
    process.exit(1);
  }
};
connectDB();

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/classes", require("./routes/classes"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/leaves", require("./routes/leaves"));
app.use("/api/reports", require("./routes/reports"));

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "✅ Attendance Aura Backend (MongoDB)",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString()
  });
});

// Serve frontend production files when built
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../smart attendance test 1/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}

// Socket.io
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);
  socket.on("join-session", (sessionId) => {
    socket.join(`session-${sessionId}`);
    console.log(`Joined session: ${sessionId}`);
  });
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (must be last)
app.use((err, req, res, next) => {
  console.error("Error:", err);
  
  // Handle different error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error: ' + err.message });
  }
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(400).json({ error: 'Database error: ' + err.message });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3001;
let PORT = DEFAULT_PORT;
const MAX_PORT_RETRIES = 10;

const startServer = (port) => {
  server.listen(port, () => {
    console.log(`🚀 Backend running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    if (PORT < DEFAULT_PORT + MAX_PORT_RETRIES) {
      console.warn(`❌ Port ${PORT} is already in use. Trying a fallback port...`);
      PORT += 1;
      console.log(`🔁 Retrying with port ${PORT}`);
      startServer(PORT);
      return;
    }
    console.error(`❌ All fallback ports from ${DEFAULT_PORT} to ${DEFAULT_PORT + MAX_PORT_RETRIES} are in use.`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});

startServer(PORT);
