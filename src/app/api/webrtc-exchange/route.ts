import { NextResponse } from "next/server";

/**
 * WebRTC connection negotiation proxy
 * This endpoint proxies WebRTC connection requests to OpenAI to avoid CORS issues
 */
export async function POST(request: Request) {
  try {
    const { sdp, codec } = await request.json();
    
    // Forward the request to OpenAI's WebRTC connection endpoint
    const response = await fetch("https://api.openai.com/v1/audio/real-time/connection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        sdp,
        codec: codec || "opus",
      }),
    });

    // Check for errors
    if (!response.ok) {
      console.error("Error from OpenAI WebRTC endpoint:", response.status, response.statusText);
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Return the response from OpenAI
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /webrtc-exchange:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
} 