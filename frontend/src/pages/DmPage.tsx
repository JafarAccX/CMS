import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useUiStore } from "../store/uiStore";
import { useSocket } from "../hooks/useSocket";
import { format } from "date-fns";
import { MessageCircle, Search, Send, Paperclip, ImageIcon, File as FileIcon, X, Loader2, Users, Info, Plus, Check, CheckCheck, Mic, Square, Smile } from "lucide-react";
import { toast } from "react-hot-toast";
import { UserProfileSidebar } from "../components/UserProfileSidebar";
import NotificationDropdown from "../components/NotificationDropdown";
import TypingIndicator from "../components/TypingIndicator";
import OnlineStatusDot from "../components/OnlineStatusDot";

export default function DmPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const user = useAuthStore((s) => s.user);
  const conversations = useDmStore((s) => s.conversations);
  const setConversations = useDmStore((s) => s.setConversations);
  const messages = useDmStore((s) => s.messages);
  const setMessages = useDmStore((s) => s.setMessages);
  const dmTypingUsers = useUiStore((s) => s.dmTypingUsers);
  const onlineUsers = useUiStore((s) => s.onlineUsers);
  const { joinDm, leaveDm, sendDm, startDmTyping, stopDmTyping, markDmRead } = useSocket();

  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  // Fetch conversations
  const { data: convData, refetch: refetchConvs } = useQuery({
    queryKey: ["dm-conversations"],
    queryFn: async () => (await api.get("/dm/conversations")).data,
  });
  useEffect(() => { if (convData) setConversations(convData); }, [convData]);

  // Fetch messages for active conversation
  const { data: msgData } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: async () => (await api.get(`/dm/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
  });
  useEffect(() => { if (msgData && conversationId) setMessages(conversationId, msgData.messages); }, [msgData, conversationId]);

  // Fetch users for new conversation
  const { data: dmUsers } = useQuery({
    queryKey: ["dm-users"],
    queryFn: async () => (await api.get("/dm/users")).data,
    enabled: showUserPicker,
  });

  // Socket room join/leave + mark read
  useEffect(() => {
    if (conversationId) {
      joinDm(conversationId);
      markDmRead(conversationId);
      return () => { leaveDm(conversationId); };
    }
  }, [conversationId]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages[conversationId!]]);

  const activeConv = conversations.find((c) => c.id === conversationId);
  const convMessages = (conversationId ? messages[conversationId] : []) || [];
  const currentDmTyping = conversationId ? (dmTypingUsers[conversationId] || []) : [];

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0) || !conversationId || !user || isUploading) return;
    
    setIsUploading(true);
    let uploadedAttachments: any[] = [];
    
    try {
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach(f => formData.append("files", f));
        const res = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        uploadedAttachments = res.data.files;
      }
      
      const content = input.trim();
      const tempId = Math.random().toString(36).substring(7);
      
      useDmStore.getState().addOptimisticMessage(conversationId, {
        id: tempId,
        tempId,
        conversation_id: conversationId,
        sender_id: user?.id || "",
        content,
        is_read: false,
        created_at: new Date().toISOString(),
        sender: { id: user?.id || "", username: user?.username || "You", role: user?.role || "learner" },
        attachments: uploadedAttachments
      });

      sendDm(conversationId, content, tempId, uploadedAttachments);
      refetchConvs();
      setInput("");
      setFiles([]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // ── Voice Recording ──────────────────────────────────
  const startRecording = async () => {
    if (!conversationId || isUploading) return;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Recording requires a secure (HTTPS) connection or is not supported by your browser.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const supportedType = types.find(t => MediaRecorder.isTypeSupported(t));
      
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      } catch (err) {
        recorder = new MediaRecorder(stream);
      }

      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      
      const targetConvId = conversationId;
      const finalMimeType = recorder.mimeType || 'audio/webm';

      recorder.onstop = async () => {
        stream?.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: finalMimeType });
        if (blob.size < 100) {
          toast.error("Recording was too short");
          return;
        }

        const ext = finalMimeType.includes('mp4') ? 'mp4' : finalMimeType.includes('ogg') ? 'ogg' : 'webm';
        const file = new window.File([blob], `voice_${Date.now()}.${ext}`, { type: finalMimeType });
        const formData = new FormData();
        formData.append('files', file);
        
        const tempId = Math.random().toString(36).substring(7);

        try {
          setIsUploading(true);
          if (targetConvId && user) {
            useDmStore.getState().addOptimisticMessage(targetConvId, {
              id: tempId,
              tempId,
              conversation_id: targetConvId,
              sender_id: user.id,
              content: "",
              is_read: false,
              created_at: new Date().toISOString(),
              sender: { id: user.id, username: user.username, role: user.role },
              attachments: [{ id: 'temp-' + tempId, file_url: '', file_name: file.name, file_size: file.size, mime_type: finalMimeType }],
            });
          }

          const res = await api.post('/upload', formData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          if (targetConvId) {
            sendDm(targetConvId, '', tempId, res.data.files);
          }
        } catch (err) { 
          console.error('Voice upload failed:', err);
          if (targetConvId) useDmStore.getState().removeOptimisticMessage(targetConvId, tempId);
          toast.error("Failed to send voice note");
        }
        finally { setIsUploading(false); }
      };
      
      recorder.start(1000); // Collect chunks every 1sec
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) { 
      console.error('Mic access error:', err);
      stream?.getTracks().forEach(t => t.stop());
      toast.error("Microphone access denied or error occurred");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    mediaRecorderRef.current = null;
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(f => f.size <= 10 * 1024 * 1024);
      setFiles(prev => [...prev, ...validFiles].slice(0, 10));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTyping = () => {
    if (!conversationId) return;
    startDmTyping(conversationId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopDmTyping(conversationId), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const startNewConversation = async (targetUserId: string) => {
    try {
      const { data } = await api.post("/dm/conversations", { targetUserId });
      setShowUserPicker(false);
      refetchConvs();
      navigate(`/dm/${data.id}`);
    } catch {}
  };

  const filteredUsers = dmUsers?.filter((u: any) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const rc = (role: string) => role === "admin" ? "text-[oklch(0.70_0.15_25)]" : role === "mentor" ? "text-[oklch(0.78_0.12_215)]" : role === "moderator" ? "text-[oklch(0.70_0.16_290)]" : "text-muted";

  return (
    <div className="h-screen flex bg-surface text-primary relative overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Left — Conversation List */}
      <aside className={`
        ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 fixed lg:relative inset-y-0 left-0 z-40
        w-80 bg-surface-50 border-r border-hairline flex flex-col shrink-0
        transition-transform duration-300 ease-in-out lg:flex
      `}>
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <div className="text-sm font-semibold text-primary">Direct messages</div>
          <button onClick={() => setShowUserPicker(true)} className="btn-surface flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] font-medium" title="New message">
            <Plus className="w-3.5 h-3.5" /> New message
          </button>
        </div>
        <div className="px-3.5 pt-3 pb-2">
          <div className="h-8 px-2.5 bg-surface-100 border border-hairline rounded-lg flex items-center gap-2 text-dim">
            <Search className="w-[13px] h-[13px]" />
            <span className="text-[12.5px]">Find a conversation…</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
          {conversations.map((c) => (
            <Link key={c.id} to={`/dm/${c.id}`} onClick={() => setIsMobileSidebarOpen(false)} className={`flex items-center gap-3 px-2.5 py-2.5 rounded-[10px] transition-all mb-px ${c.id === conversationId ? "bg-accent-100 border border-accent-200" : "hover:bg-surface-100 border border-transparent"}`}>
              <div className="relative shrink-0">
                <span className="avatar w-[38px] h-[38px] text-[13px]">
                  {c.otherUser.username[0].toUpperCase()}
                </span>
                <OnlineStatusDot isOnline={onlineUsers.has(c.otherUser.id)} size="sm" className="absolute -bottom-0.5 -right-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[12.5px] font-semibold truncate flex-1 ${c.id === conversationId ? "text-accent-300" : "text-primary"}`}>{c.otherUser.username}</span>
                  {c.otherUser.role === "mentor" && <span className="chip chip-mentor text-[9px]">M</span>}
                </div>
                {c.lastMessage && <p className="text-[12.5px] text-dim truncate mt-0.5">{c.lastMessage.content}</p>}
              </div>
              {c.unreadCount > 0 && <span className="min-w-[18px] h-[18px] px-1.5 bg-accent-400 text-white rounded-full text-[10px] font-bold flex items-center justify-center">{c.unreadCount}</span>}
            </Link>
          ))}
          {conversations.length === 0 && <p className="text-faint text-sm text-center py-8">No conversations yet</p>}
        </div>
      </aside>

      {/* Center — Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {conversationId && activeConv ? (
          <>
            <header className="h-[60px] border-b border-hairline bg-surface-50/80 backdrop-blur flex items-center px-6 gap-3 shrink-0">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-2 -ml-2 text-dim hover:text-primary lg:hidden"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
              <div
                className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
                onClick={() => setShowProfile(true)}
              >
                <div className="relative">
                  <span className="avatar avatar-indigo w-9 h-9 text-[13px] group-hover:scale-105 transition-transform">
                    {activeConv.otherUser.username[0].toUpperCase()}
                  </span>
                  <OnlineStatusDot isOnline={onlineUsers.has(activeConv.otherUser.id)} size="sm" className="absolute -bottom-0.5 -right-0.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[19px] font-semibold truncate group-hover:text-accent-300 transition-colors" style={{ letterSpacing: "-0.012em" }}>{activeConv.otherUser.username}</h2>
                    {activeConv.otherUser.role === "mentor" && <span className="chip chip-mentor">mentor</span>}
                  </div>
                  <p className="text-[11px] text-dim font-normal">{onlineUsers.has(activeConv.otherUser.id) ? "Online · typically replies within an hour" : "Offline"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <NotificationDropdown />
                <button className="btn-ghost p-2 rounded-lg" aria-label="Search messages"><Search className="w-4 h-4" /></button>
                <button
                  onClick={() => setShowProfile(!showProfile)}
                  className={`btn-ghost p-2 rounded-lg ${showProfile ? 'bg-accent-100 text-accent-300' : ''}`}
                  aria-label={showProfile ? "Hide profile" : "Show profile"}
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-1">
              {convMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-faint">
                  <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3">
                    <MessageCircle className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm text-dim">No messages yet</p>
                  <p className="text-xs text-faint mt-1">Say hello or drop a file to get the conversation started.</p>
                </div>
              )}
              {convMessages.map((msg) => {
                const isMe = String(msg.sender_id).toLowerCase() === String(user?.id).toLowerCase();
                
                return (
                  <div key={msg.id} className={`flex gap-3 py-1 msg-enter ${isMe ? "justify-end" : ""} ${msg.isOptimistic ? "is-optimistic" : ""}`}>
                    {!isMe && (
                      <span className="avatar avatar-indigo w-8 h-8 text-xs shrink-0 mt-0.5">
                        {msg.sender.username[0].toUpperCase()}
                      </span>
                    )}
                    <div className={`max-w-[65%] ${isMe ? "order-first" : ""}`}>
                      <div className={`px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${isMe ? "bg-gradient-to-b from-accent-300 via-accent-400 to-accent-600 text-white rounded-br-sm shadow-[0_4px_14px_-4px_rgba(79,124,255,0.45)]" : "bg-surface-100 text-primary border border-hairline rounded-bl-sm"}`}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.attachments.map((a: any) => {
                              const isImage = a.mime_type?.startsWith('image/');
                              const isAudio = a.mime_type?.startsWith('audio/');
                              
                              if (isAudio) return (
                                <div key={a.id} className="flex items-center gap-2 p-2 bg-surface-100 rounded-lg border border-hairline">
                                  <Mic className="w-4 h-4 text-accent-400 shrink-0" />
                                  {a.file_url ? (
                                    <audio controls className="h-8 w-44" src={`${import.meta.env.VITE_SOCKET_URL}${a.file_url}`} />
                                  ) : (
                                    <div className="flex items-center gap-2 px-2 text-[10px] text-dim">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Sending...
                                    </div>
                                  )}
                                </div>
                              );

                              return isImage ? (
                                <a key={a.id} href={`${import.meta.env.VITE_SOCKET_URL}${a.file_url}`} target="_blank" rel="noreferrer" className="block w-48 h-auto overflow-hidden rounded-lg hover:opacity-90 transition-opacity">
                                  <img src={`${import.meta.env.VITE_SOCKET_URL}${a.file_url}`} alt={a.file_name} className="w-full h-auto object-cover" />
                                </a>
                              ) : (
                                <a key={a.id} href={`${import.meta.env.VITE_SOCKET_URL}${a.file_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 p-2 bg-surface-100 hover:bg-surface-200 transition-colors border border-hairline rounded-lg text-sm text-accent-200 self-start w-48">
                                  <FileIcon className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{a.file_name}</span>
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                        <p className="text-[10px] text-dim">{format(new Date(msg.created_at), "HH:mm")}</p>
                        {isMe && (
                          msg.is_read
                            ? <CheckCheck className="w-3.5 h-3.5 text-accent-300" />
                            : <Check className="w-3.5 h-3.5 text-faint" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <TypingIndicator users={currentDmTyping} />
            <div className="p-4 border-t border-hairline flex flex-col gap-2">
              {/* Voice Recording Indicator */}
              {isRecording && (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 animate-pulse">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 text-sm font-medium">Recording... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                  <button onClick={stopRecording} className="ml-auto p-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors">
                    <Square className="w-4 h-4" />
                  </button>
                </div>
              )}

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 bg-accent-100 text-accent-200 border border-accent-200 px-3 py-1.5 rounded-lg text-sm">
                      {file.type.startsWith('image/') ? <ImageIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="p-0.5 hover:bg-accent-200 rounded" aria-label="Remove file"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-surface-100 border border-hairline-strong rounded-xl shadow-inner-highlight overflow-hidden">
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="*/*" />
                <div className="px-3.5 py-3">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); handleTyping(); }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder={`Message ${activeConv?.otherUser?.username || ""}…`}
                    className="w-full bg-transparent text-primary placeholder-faint resize-none focus:outline-none text-[13.5px] leading-relaxed"
                    disabled={isUploading}
                  />
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5 border-t border-hairline">
                  <button onClick={() => fileInputRef.current?.click()} className="btn-ghost p-1.5 rounded-lg" disabled={isUploading} aria-label="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button className="btn-ghost p-1.5 rounded-lg" aria-label="Insert emoji"><Smile className="w-4 h-4" /></button>
                  {!isRecording && (
                    <button onClick={startRecording} className="btn-ghost p-1.5 rounded-lg" title="Record voice note">
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <span className="flex-1" />
                  <button onClick={handleSend} disabled={(!input.trim() && files.length === 0) || isUploading} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] disabled:opacity-40">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Send</>}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-faint bg-surface-50/10">
            <div className="text-center">
              <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 opacity-20" />
              </div>
              <p className="text-sm">Select a conversation to start chatting</p>
              <button onClick={() => setShowUserPicker(true)} className="btn-primary mt-4 px-4 py-2 text-sm font-medium rounded-lg transition-all">
                Start a conversation
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Profile Sidebar */}
      {showProfile && activeConv && (
        <UserProfileSidebar 
          user={activeConv.otherUser} 
          isOnline={onlineUsers.has(activeConv.otherUser.id)}
          onClose={() => setShowProfile(false)} 
          onMessage={() => setShowProfile(false)} 
        />
      )}

      {/* User Picker Modal */}
      {showUserPicker && (
        <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowUserPicker(false)}>
          <div className="bg-surface-50 border border-hairline rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary"><Users className="w-5 h-5 text-accent-300" />New Conversation</h3>
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full pl-10 pr-4 py-2.5 bg-surface-100 border border-hairline-strong rounded-lg text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 text-sm" />
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
              {filteredUsers.map((u: any) => (
                <button key={u.id} onClick={() => startNewConversation(u.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-100 transition-all text-left">
                  <div className="relative">
                    <span className="avatar avatar-indigo w-8 h-8 text-xs">
                      {u.username[0].toUpperCase()}
                    </span>
                    <OnlineStatusDot isOnline={onlineUsers.has(u.id)} size="sm" className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-primary font-medium">{u.username}</span>
                    <span className={`ml-2 text-[10px] uppercase ${rc(u.role)}`}>{u.role}</span>
                    <p className="text-xs text-faint truncate">{u.email}</p>
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && <p className="text-faint text-sm text-center py-4">No users found</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
