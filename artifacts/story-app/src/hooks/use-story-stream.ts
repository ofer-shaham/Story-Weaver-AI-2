import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOpenrouterMessagesQueryKey } from "@workspace/api-client-react";

export function useStoryStream(conversationId: number) {
  const [isTyping, setIsTyping] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const queryClient = useQueryClient();

  const sendMessage = useCallback(
    async (content: string) => {
      setIsTyping(true);
      setStreamedContent("");

      try {
        const response = await fetch(`/api/openrouter/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.content) {
                    setStreamedContent((prev) => prev + data.content);
                  }
                  if (data.done) {
                    done = true;
                  }
                } catch (e) {
                  console.error("Failed to parse SSE chunk", e);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error streaming message:", error);
      } finally {
        setIsTyping(false);
        setStreamedContent("");
        // Invalidate to fetch the completed message from the DB
        queryClient.invalidateQueries({
          queryKey: getListOpenrouterMessagesQueryKey(conversationId),
        });
      }
    },
    [conversationId, queryClient]
  );

  return { sendMessage, isTyping, streamedContent };
}
