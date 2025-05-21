# Expected behaviour

## Chat page

1. User session initalizes in the browers.
2. Intro Screen is show.
3. User selects the agent to start the conversation.
4. UI changes to speak page
   1. UI Elements are disabled
5. The Agent provides a hello message
   1. Agent has speaking indicator
6. Agent intro message is complete
7. The WebRTC connection is established.
8. UI is enabled
9. User has active indicator, circles and now the line
10. User sends a message which is detected with VAD.
11. Agent responds
12. User switches agent
13. WebRTC Connection is ended.
14. UI is disabled
15. New agent Into message is played. 
16. New webRTC connection is created
17. UI is enabled
18. User sends message to agent by speaking into the live mic.
19. Agent responds.
20. User switches agents.
21. UI is disabled.
22. Conection is ended.
23. New connection is created.
24. Simulated user message of "Hi" is sent. 
25. Agent responds to "Hi"
26. User sends message, "how are you doing?"
27. Agent responds. 



# Agent behaviour
- Anytime the agent is speaking they will have an indicator.