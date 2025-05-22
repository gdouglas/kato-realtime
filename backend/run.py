#!/usr/bin/env python
"""
Simple entry point script for the Kato API Server.
This allows running the server from any directory.
"""

import os
import sys

# Add the current directory to the path to allow imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from main import start

if __name__ == "__main__":
    start() 