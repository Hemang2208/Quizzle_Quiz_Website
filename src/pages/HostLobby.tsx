import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Users, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import QRCode from 'react-qr-code';
import { testSupabaseConnection } from '@/lib/supabaseTest';

// --- Helper Functions ---

// Formats the PIN as "XXX XXX"
const formatPin = (pin) => {
  if (!pin) return '...';
  const pinStr = pin.toString();
  if (pinStr.length > 3) {
    return `${pinStr.slice(0, 3)} ${pinStr.slice(3)}`;
  }
  return pinStr;
};

// Assigns a consistent "avatar" emoji based on the participant's ID
const avatars = ['😀', '😎', '🤩', '🧑‍🚀', '👾', '🤖', '👻', '👽', '🧠', '🧙', '🧟', '🧛'];
const getParticipantEmoji = (participantId) => {
  // A simple hash to get a consistent index
  const hash = participantId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatars[hash % avatars.length];
};
// --- End Helper Functions ---

const HostLobby = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quiz, setQuiz] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizId) return;

    // Test Supabase connection first
    testSupabaseConnection().then(result => {
      if (!result.success) {
        toast({ 
          title: 'Connection Error', 
          description: `Database connection failed: ${result.error}`,
          variant: 'destructive' 
        });
      }
    });

    const fetchQuiz = async () => {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (error) {
        console.error('Error fetching quiz:', error);
        toast({ title: 'Error', description: 'Quiz not found', variant: 'destructive' });
        navigate('/');
        return;
      }

      setQuiz(data);
      setLoading(false);
    };

    const fetchParticipants = async () => {
      const { data } = await supabase
        .from('participants')
        .select('*')
        .eq('quiz_id', quizId)
        .order('joined_at', { ascending: true });
      setParticipants(data || []);
    };

    fetchQuiz();
    fetchParticipants();

    // Subscribe to participant changes
    const channel = supabase
      .channel('participants-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `quiz_id=eq.${quizId}`,
        },
        () => {
          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, navigate, toast]);

  const handleStart = async () => {
    if (participants.length === 0) {
      toast({ title: 'Wait!', description: 'No participants have joined yet', variant: 'destructive' });
      return;
    }

    try {
      // First, verify the quiz has questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id')
        .eq('quiz_id', quizId);

      if (questionsError) {
        console.error('Error checking questions:', questionsError);
        toast({ 
          title: 'Failed to start quiz', 
          description: 'Could not verify quiz questions. Please try again.',
          variant: 'destructive' 
        });
        return;
      }

      if (!questions || questions.length === 0) {
        toast({ 
          title: 'Cannot start quiz', 
          description: 'This quiz has no questions. Please add questions before starting.',
          variant: 'destructive' 
        });
        return;
      }

      // Now update the quiz status
      const { error } = await supabase
        .from('quizzes')
        .update({ status: 'playing' })
        .eq('id', quizId);

      if (error) {
        console.error('Error starting quiz:', error);
        toast({ 
          title: 'Failed to start quiz', 
          description: error.message || 'Unable to start the quiz. Please try again.',
          variant: 'destructive' 
        });
        return;
      }

      navigate(`/host/play/${quizId}`);
    } catch (error) {
      console.error('Unexpected error starting quiz:', error);
      toast({ 
        title: 'Failed to start quiz', 
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive' 
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-2xl font-bold text-primary">Loading...</div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/join?pin=${quiz?.pin}`;
  const joinHost = window.location.origin.replace(/https?:\/\//, '');

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      
      {/* Top Bar: Join Info, PIN, QR Code */}
      <header className="w-full bg-card shadow-lg z-10 p-4 grid grid-cols-3 items-center">
        {/* Left: Join Info */}
        <div className="col-span-1">
          <div className="text-sm text-muted-foreground">Join at</div>
          <div className="text-lg font-bold text-foreground">
            {joinHost}/join
          </div>
        </div>
        
        {/* Center: PIN */}
        <div className="col-span-1 text-center">
          <div className="text-sm font-medium text-muted-foreground mb-1">Game PIN</div>
          <div className="text-5xl font-extrabold text-primary tracking-widest animate-pulse">
            {formatPin(quiz?.pin)}
          </div>
        </div>
        
        {/* Right: QR Code */}
        <div className="col-span-1 flex justify-end">
          <div className="bg-white p-2 rounded-lg w-24 h-24 md:w-32 md:h-32">
            <QRCode 
              value={joinUrl} 
              style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
            />
          </div>
        </div>
      </header>

      {/* Main Content: Title & Participant Grid */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-foreground">
          {quiz?.title}
        </h1>
        
        <div className="flex flex-wrap justify-center items-center gap-4 w-full max-w-5xl">
          {participants.length === 0 ? (
            <div className="text-2xl text-muted-foreground animate-pulse">
              Waiting for players...
            </div>
          ) : (
            participants.map((participant, index) => (
              <div
                key={participant.id}
                className="px-6 py-3 bg-input shadow-lg rounded-lg text-xl font-bold text-foreground animate-scale-in flex items-center gap-3"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span>{getParticipantEmoji(participant.id)}</span>
                {participant.display_name}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer: Count & Start Button */}
      <footer className="w-full bg-card/80 backdrop-blur-sm shadow-inner p-4 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Left: Count */}
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-muted-foreground" />
            <span className="text-3xl font-bold text-foreground">{participants.length}</span>
            <span className="text-lg text-muted-foreground pt-1">Participants</span>
          </div>
          
          {/* Right: Start Button (using quiz colors) */}
          <Button
            onClick={handleStart}
            size="lg"
            className="text-lg font-bold bg-black text-white hover:opacity-90 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            disabled={participants.length === 0}
          >
            <Play className="w-5 h-5 mr-2" />
            Start
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default HostLobby;
