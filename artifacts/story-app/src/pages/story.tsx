import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetOpenrouterConversation,
  useListOpenrouterMessages,
  useUpdateOpenrouterMessage,
  getListOpenrouterMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStoryStream } from "@/hooks/use-story-stream";
import { useSettings } from "@/hooks/use-settings";
import { useVoice } from "@/hooks/use-voice";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Send,
  Sparkles,
  PenLine,
  Pencil,
  Check,
  X,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Story() {
  const [, params] = useRoute("/story/:id");
  const id = Number(params?.id);

  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();

  const { data: conversation, isLoading: isLoadingConv } = useGetOpenrouterConversation(id, {
    query: { enabled: !!id },
  });

  const { data: messages, isLoading: isLoadingMsgs } = useListOpenrouterMessages(id, {
    query: { enabled: !!id },
  });

  const { sendMessage, isTyping, streamedContent } = useStoryStream(id, settings);
  const updateMessage = useUpdateOpenrouterMessage();

  // Voice
  const voice = useVoice(settings.blindMode);
  const hasSpokenLastRef = useRef<number | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Composer
  const [draft, setDraft] = useState("");
  const endOfStoryRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stopListenRef = useRef<(() => void) | null>(null);

  // Auto-scroll
  useEffect(() => {
    endOfStoryRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent, isTyping]);

  // Blind mode: read last AI message aloud when messages change and AI is done
  useEffect(() => {
    if (!settings.blindMode || isTyping || !messages?.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    if (hasSpokenLastRef.current === lastMsg.id) return;
    hasSpokenLastRef.current = lastMsg.id;
    voice.speak(lastMsg.content);
  }, [messages, isTyping, settings.blindMode, voice]);

  // Inline edit handlers
  const startEdit = (id: number, content: string) => {
    setEditingId(id);
    setEditDraft(content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (messageId: number) => {
    if (!editDraft.trim()) return;
    await updateMessage.mutateAsync({
      messageId,
      data: { content: editDraft.trim() },
    });
    queryClient.invalidateQueries({ queryKey: getListOpenrouterMessagesQueryKey(id) });
    setEditingId(null);
    setEditDraft("");
  };

  // Composer: send
  const handleSend = useCallback(async () => {
    if (!draft.trim() || isTyping) return;
    const content = draft.trim();
    setDraft("");
    await sendMessage(content);
  }, [draft, isTyping, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // Voice: start / stop listening
  const startListening = () => {
    voice.stopSpeaking();
    const stop = voice.listen(
      (transcript) => {
        setDraft((prev) => (prev ? prev + " " + transcript : transcript));
      },
      () => {
        stopListenRef.current = null;
      }
    );
    stopListenRef.current = stop;
  };

  const stopListening = () => {
    stopListenRef.current?.();
    stopListenRef.current = null;
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

  const isListening = voice.state === "listening";
  const isSpeaking = voice.state === "speaking";

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
        <div className="flex items-center gap-1">
          {settings.blindMode && isSpeaking && (
            <Button
              variant="ghost"
              size="icon"
              className="text-primary animate-pulse"
              onClick={() => voice.stopSpeaking()}
              aria-label="Stop reading"
            >
              <Volume2 className="w-5 h-5" />
            </Button>
          )}
          <SettingsDialog settings={settings} onSave={updateSettings} />
        </div>
      </header>

      {/* Story Content */}
      <div
        className="flex-1 overflow-y-auto px-6 md:px-12 py-8 font-serif text-lg leading-loose space-y-8"
        ref={scrollContainerRef}
      >
        {messages?.length === 0 && (
          <div className="text-center py-20 text-muted-foreground italic">
            The first page is blank. Write the opening paragraph below...
          </div>
        )}

        {messages?.filter((msg) => msg.content.trim() !== "").map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "group relative animate-in fade-in slide-in-from-bottom-2 duration-500",
              msg.role === "assistant" ? "text-foreground" : "text-primary/90"
            )}
          >
            {/* Role marker */}
            <div
              className={cn(
                "absolute -left-8 top-1.5 opacity-0 group-hover:opacity-40 transition-opacity",
                msg.role === "assistant" ? "text-secondary-foreground" : "text-primary"
              )}
            >
              {msg.role === "assistant" ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <PenLine className="w-4 h-4" />
              )}
            </div>

            {editingId === msg.id ? (
              /* Inline editor */
              <div className="space-y-2">
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  autoFocus
                  className="min-h-[100px] resize-none font-serif text-lg leading-relaxed bg-background/80 border-primary/40 focus-visible:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEdit();
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(msg.id);
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelEdit}
                    className="h-8 text-muted-foreground hover:text-foreground font-sans text-xs"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveEdit(msg.id)}
                    disabled={!editDraft.trim() || updateMessage.isPending}
                    className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 font-sans text-xs"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              /* Normal view with hover edit button */
              <div className="relative">
                <div className="whitespace-pre-wrap">{msg.content}</div>
                <button
                  onClick={() => startEdit(msg.id, msg.content)}
                  aria-label="Edit passage"
                  className="absolute -right-8 top-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1 rounded"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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

      {/* Editor / Voice area */}
      <div className="p-4 md:p-6 border-t border-border/40 bg-card rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        {settings.blindMode ? (
          /* Blind mode composer */
          <div className="space-y-3">
            {/* Voice status */}
            <div className="text-center text-sm font-sans text-muted-foreground italic min-h-[1.5em]">
              {isSpeaking
                ? "Listening to the story… tap the speaker icon in the header to stop."
                : isListening
                ? "Recording your voice… speak your paragraph, then tap the mic again to stop."
                : isTyping
                ? "Your co-author is writing…"
                : "Tap the microphone to speak your next paragraph."}
            </div>

            {/* Transcribed preview */}
            {draft && (
              <div className="px-4 py-3 rounded-lg bg-background/70 border border-border/40 font-serif text-base leading-relaxed text-primary/80 min-h-[60px]">
                {draft}
              </div>
            )}

            <div className="flex items-center justify-center gap-4">
              {/* Mic button */}
              <Button
                size="lg"
                onClick={isListening ? stopListening : startListening}
                disabled={isTyping || isSpeaking}
                className={cn(
                  "h-16 w-16 rounded-full shadow-md transition-all",
                  isListening
                    ? "bg-destructive hover:bg-destructive/90 text-white animate-pulse"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
                aria-label={isListening ? "Stop recording" : "Start recording"}
              >
                {isListening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </Button>

              {/* Send transcribed text */}
              {draft && !isListening && (
                <Button
                  size="lg"
                  onClick={handleSend}
                  disabled={!draft.trim() || isTyping}
                  className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                  aria-label="Send"
                >
                  <Send className="w-6 h-6 ml-0.5" />
                </Button>
              )}

              {/* Clear draft */}
              {draft && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDraft("")}
                  className="h-10 w-10 rounded-full text-muted-foreground"
                  aria-label="Clear"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Normal text composer */
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isTyping
                  ? "Your co-author is writing…"
                  : "Write your next paragraph… (Cmd+Enter to send)"
              }
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
        )}
      </div>
    </div>
  );
}
