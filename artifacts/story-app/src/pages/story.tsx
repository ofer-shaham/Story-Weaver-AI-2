import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetOpenrouterConversation, 
  useListOpenrouterMessages 
} from "@workspace/api-client-react";
import { useStoryStream } from "@/hooks/use-story-stream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Story() {
  const [, params] = useRoute("/story/:id");
  const id = Number(params?.id);
  
  const { data: conversation, isLoading: isLoadingConv } = useGetOpenrouterConversation(id, { 
    query: { enabled: !!id } 
  });
  
  const { data: messages, isLoading: isLoadingMsgs } = useListOpenrouterMessages(id, {
    query: { enabled: !!id }
  });

  const { sendMessage, isTyping, streamedContent } = useStoryStream(id);
  
  const [draft, setDraft] = useState("");
  const endOfStoryRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (endOfStoryRef.current) {
      endOfStoryRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamedContent, isTyping]);

  const handleSend = async () => {
    if (!draft.trim() || isTyping) return;
    const content = draft.trim();
    setDraft("");
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoadingConv || isLoadingMsgs) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 h-screen flex flex-col">
        <div className="h-8 bg-muted animate-pulse rounded w-1/3 mb-12"></div>
        <div className="space-y-6 flex-1">
          <div className="h-24 bg-muted animate-pulse rounded w-full"></div>
          <div className="h-32 bg-muted animate-pulse rounded w-5/6"></div>
          <div className="h-20 bg-muted animate-pulse rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="max-w-3xl mx-auto py-20 px-6 text-center">
        <h2 className="text-2xl font-serif mb-4">Story not found</h2>
        <Link href="/">
          <Button variant="outline" className="font-sans">Return to Library</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="py-6 px-6 md:px-8 border-b border-border/40 sticky top-0 bg-background/95 backdrop-blur-sm z-10 flex items-center justify-between">
        <div className="flex items-center gap-4 overflow-hidden">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-serif font-medium text-foreground truncate">
            {conversation.title}
          </h1>
        </div>
      </header>

      {/* Story Content */}
      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 font-serif text-lg leading-loose space-y-8" ref={scrollContainerRef}>
        {messages?.length === 0 && (
          <div className="text-center py-20 text-muted-foreground italic">
            The first page is blank. Write the opening paragraph below...
          </div>
        )}
        
        {messages?.map((msg) => (
          <div 
            key={msg.id} 
            className={cn(
              "group relative animate-in fade-in slide-in-from-bottom-2 duration-500",
              msg.role === "assistant" ? "text-foreground" : "text-primary/90"
            )}
          >
            {/* Minimalist marker for who wrote what */}
            <div className={cn(
              "absolute -left-8 top-1.5 opacity-0 group-hover:opacity-40 transition-opacity",
              msg.role === "assistant" ? "text-secondary-foreground" : "text-primary"
            )}>
              {msg.role === "assistant" ? <Sparkles className="w-4 h-4" /> : <PenLine className="w-4 h-4" />}
            </div>
            
            <div className="whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming AI response */}
        {isTyping && (
          <div className="relative text-foreground animate-in fade-in duration-300">
            <div className="absolute -left-8 top-1.5 opacity-40 text-secondary-foreground">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="whitespace-pre-wrap">
              {streamedContent}
              <span className="inline-block w-1.5 h-5 ml-1 align-middle bg-primary/50 animate-pulse"></span>
            </div>
          </div>
        )}
        
        <div ref={endOfStoryRef} className="h-4" />
      </div>

      {/* Editor area */}
      <div className="p-4 md:p-6 border-t border-border/40 bg-card rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isTyping ? "Your co-author is writing..." : "Write your next paragraph... (Cmd+Enter to send)"}
            disabled={isTyping}
            className="min-h-[120px] resize-none pr-16 font-serif text-lg leading-relaxed bg-background/50 border-border/50 focus-visible:ring-primary/50 placeholder:italic placeholder:font-serif"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || isTyping}
            className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
