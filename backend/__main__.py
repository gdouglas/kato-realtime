"""Main entry point for the Kato API Server when run as a module."""

import logging
import os
import sys

# Add the parent directory to the path to allow imports when running as a module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from main import start

# Get module logger
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting server via module entry point")
    start() 