"""Kato API Server - Main application entry point."""

import logging
import uvicorn
from config import settings

# Import app from app.py
from app import app

# Get module logger
logger = logging.getLogger(__name__)

def start():
    """Start the server."""
    logger.info(f"Starting server on {settings.HOST}:{settings.PORT}")
    uvicorn.run("app:app", host=settings.HOST, port=settings.PORT, reload=True)

if __name__ == "__main__":
    start() 