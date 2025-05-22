"""Tests for health check endpoint."""

import pytest

def test_health_check(client):
    """Test that the health check endpoint returns 200."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "ok" 