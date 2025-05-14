"""Tests for session management routes."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

def test_create_session_success(client):
    """Test successful session creation."""
    # Mock the httpx response
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "id": "sess_123",
        "expires_at": "2023-01-01T00:00:00Z"
    }
    
    # Patch the httpx AsyncClient post method
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        response = client.get("/api/session")
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"] == "sess_123"
        assert "expires_at" in data

def test_create_session_api_error(client):
    """Test error handling when OpenAI API fails."""
    # Mock the httpx response for an error
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.reason_phrase = "Unauthorized"
    
    # Patch the httpx AsyncClient post method
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        response = client.get("/api/session")
        
        # Assertions
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "OpenAI API error" in data["detail"] 