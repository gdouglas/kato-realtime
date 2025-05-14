"""Kato API Server - Core application definition."""

import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings, Settings

# Import route modules
from routes import auth, webrtc, session, chat

# Get module logger
logger = logging.getLogger(__name__)

# Configure the app
app = FastAPI(
    title="Kato API Server",
    description="API server for the Kato realtime application",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
async def read_root(settings: Settings = Depends(get_settings)):
    """Health check endpoint."""
    return {
        "status": "ok", 
        "message": "Kato API Server is running",
        "version": "0.1.0",
        "environment": "development" if "localhost" in settings.CORS_ORIGINS[0] else "production"
    }

# Include routers from route modules
app.include_router(auth.router, prefix="/v1")
app.include_router(webrtc.router, prefix="/v1")
app.include_router(session.router, prefix="/v1")
app.include_router(chat.router, prefix="/v1") 