import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListOpenrouterConversations, 
  useCreateOpenrouterConversation,
  useDeleteOpenrouterConversation,
  getListOpenrouterConversationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PenLine, BookOpen, Trash2 } from "lucide-react";

export default function Home() {
  const { data: conversations, isLoading } = useListOpenrouterConversations();
  const createConversation = useCreateOpenrouterConversation();
  const deleteConversation = useDeleteOpenrouterConversation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [firstLine, setFirstLine] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) return;
    
    createConversation.mutate(
      { data: { title } },
      {
        onSuccess: async (newConv) => {
          setIsDialogOpen(false);
          setTitle("");
          
          if (firstLine.trim()) {
            // If they provided a first line, we need to go to the story page 
            // and maybe trigger an initial message. But we can just navigate there
            // and pass it in state, or send the first message here.
            // Sending it here is complex because of SSE, let's just create it.
            try {
               await fetch(`/api/openrouter/conversations/${newConv.id}/messages`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ content: firstLine }),
               });
            } catch (e) {
               console.error("Failed initial message", e);
            }
          }
          
          queryClient.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
          setLocation(`/story/${newConv.id}`);
        }
      }
    );
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to discard this story?")) {
      deleteConversation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
          }
        }
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-serif text-primary mb-2 flex items-center gap-3">
            <BookOpen className="w-8 h-8" />
            Story Together
          </h1>
          <p className="text-muted-foreground text-lg italic font-serif">
            An intimate space to co-author tales with an imaginative friend.
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-md transition-all font-sans font-medium">
              <PenLine className="w-4 h-4 mr-2" />
              Start New Story
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] font-sans bg-card border-card-border">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-primary">Open a new notebook</DialogTitle>
              <DialogDescription className="text-foreground/70">
                Give your story a working title. You can optionally pen the first line to set the mood.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Title</label>
                <Input 
                  id="title" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="e.g. The Clockmaker's Daughter"
                  className="bg-background border-border focus-visible:ring-primary"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="firstLine" className="text-sm font-medium">Opening line (optional)</label>
                <Textarea 
                  id="firstLine" 
                  value={firstLine} 
                  onChange={(e) => setFirstLine(e.target.value)} 
                  placeholder="It was a dark and stormy night..."
                  className="min-h-[100px] bg-background border-border focus-visible:ring-primary font-serif resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleCreate} 
                disabled={!title.trim() || createConversation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
              >
                {createConversation.isPending ? "Opening notebook..." : "Begin Writing"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse bg-card border-card-border/50">
              <CardHeader className="space-y-2">
                <div className="h-6 bg-muted rounded w-2/3"></div>
                <div className="h-4 bg-muted rounded w-1/3"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-full mb-2"></div>
                <div className="h-4 bg-muted rounded w-4/5"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : conversations?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-dashed border-border flex flex-col items-center">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-serif text-foreground mb-2">No stories yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Your library is empty. Start a new notebook to begin weaving a tale together.
          </p>
          <Button 
            onClick={() => setIsDialogOpen(true)}
            variant="outline" 
            className="font-sans border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Start New Story
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {conversations?.map((conv) => (
            <Link key={conv.id} href={`/story/${conv.id}`}>
              <Card className="h-full cursor-pointer hover:shadow-md transition-all duration-300 border-card-border hover:border-primary/30 group bg-card flex flex-col">
                <CardHeader className="pb-3 flex-row items-start justify-between">
                  <div className="space-y-1 pr-4">
                    <CardTitle className="font-serif text-xl group-hover:text-primary transition-colors line-clamp-2">
                      {conv.title}
                    </CardTitle>
                    <CardDescription className="text-xs font-sans">
                      Started {format(new Date(conv.createdAt), "MMM d, yyyy")}
                    </CardDescription>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDelete(conv.id, e)}
                    aria-label="Delete story"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="mt-auto pt-4 flex justify-between items-center text-sm font-sans text-muted-foreground border-t border-border/50">
                  <span className="flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5" />
                    Continue writing
                  </span>
                  <span className="text-primary/70 group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
