"""Kato API Server package."""

import logging
import os
from dotenv import load_dotenv

__version__ = "0.1.0"

# Setup logging for the entire application
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Create a logger for this package
logger = logging.getLogger("server")

# Load environment variables early
load_dotenv()

# Provide convenient imports
from app import app
from main import start
from config import settings, get_settings 