"""Test fixtures for Kato API server tests."""

import os
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
import pytest_asyncio
from fastapi import FastAPI

# Set environment variables for testing
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["OPENAI_API_KEY"] = "test-openai-api-key"

# Import the FastAPI app
from app import app

@pytest.fixture
def client():
    """Create a test client for synchronous tests."""
    with TestClient(app) as client:
        yield client

@pytest_asyncio.fixture
async def async_client():
    """Create an async test client for async tests."""
    # Use url from TestClient to reach our FastAPI app endpoints
    async with AsyncClient(base_url="http://testserver") as client:
        yield client 