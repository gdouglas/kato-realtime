export const fetchEphemeralToken = async () => {
  const response = await fetch('/api/ephemeral-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer `
    }
  });
  return response.json();
};