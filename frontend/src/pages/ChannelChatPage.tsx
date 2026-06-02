import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useMessageStore } from "../store/messageStore";
import { useUiStore } from "../store/uiStore";
import { UserProfileSidebar } from "../components/UserProfileSidebar";
import NotificationDropdown from "../components/NotificationDropdown";
import TypingIndicator from "../components/TypingIndicator";
import OnlineStatusDot from "../components/OnlineStatusDot";

import { useSocket } from "../hooks/useSocket";
import { format } from "date-fns";
import { Send, Paperclip, Pin, Flag, Trash2, Hash, PanelRightClose, PanelRightOpen, Lock, ArrowLeft, MessageCircle, X, File as FileIcon, Image as ImageIcon, Loader2, AtSign, Smile, Reply, Mic, Square, Search, Plus } from "lucide-react";
import { toast } from "react-hot-toast";

const EMOJI_SET = ["👍", "❤️", "🔥", "😂", "🎉", "👏"];

function MentionText({ content, members }: { content: string; members?: any[] }) {
  const memberUsernames = useMemo(() => new Set(members?.map((m: any) => m.user.username.toLowerCase()) || []), [members]);
  const parts = content.split(/(@[a-zA-Z0-9_.-]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const uname = part.slice(1).toLowerCase();
          const isMember = memberUsernames.has(uname);
          return (
            <span key={i} className={isMember ? "font-bold text-accent-400 bg-accent-100 px-0.5 rounded cursor-pointer hover:underline" : ""}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function ChannelChatPage() {
  const { batchId, channelId } = useParams<{ batchId: string; channelId: string }>();
  const user = useAuthStore((s) => s.user);
  const messages = useMessageStore((s) => s.messages);
  const setMessages = useMessageStore((s) => s.setMessages);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const typingUsers = useUiStore((s) => s.typingUsers);
  const onlineUsers = useUiStore((s) => s.onlineUsers);
  const { joinChannel, leaveChannel, sendMessage, startTyping, stopTyping, toggleReaction } = useSocket();

  const [input, setInput] = useState("");
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<any>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: batch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}`)).data,
    enabled: !!batchId,
  });

  const { data: channel } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => (await api.get(`/channels/${channelId}`)).data,
    enabled: !!channelId,
  });

  const { data: channels } = useQuery({
    queryKey: ["channels", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}/channels`)).data,
    enabled: !!batchId,
  });

  const { data: msgData } = useQuery({
    queryKey: ["messages", channelId],
    queryFn: async () => (await api.get(`/messages?channel_id=${channelId}`)).data,
    enabled: !!channelId,
  });
  useEffect(() => {
    if (msgData && channelId) setMessages(channelId, msgData.messages);
  }, [msgData, channelId]);

  const { data: members } = useQuery({
    queryKey: ["members", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}/members`)).data,
    enabled: !!batchId,
  });

  const { data: dmConversations } = useQuery({
    queryKey: ["dm-conversations-badge"],
    queryFn: async () => (await api.get("/dm/conversations")).data,
    refetchInterval: 15000,
  });
  const totalUnreadDm = dmConversations?.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0) || 0;

  useEffect(() => {
    if (channelId) {
      joinChannel(channelId);
      return () => {
        leaveChannel(channelId);
      };
    }
  }, [channelId]);

  useEffect(() => {
    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: "smooth",
    });
  }, [messages[channelId!]]);

  const channelMessages = messages[channelId!] || [];
  const isGuest = user?.role === "guest";
  // batch.hasAccess flag is the source-of-truth (computed by canAccessBatch on the server)
  const hasAccess = batch?.hasAccess !== false;
  const noAccess = batch && !hasAccess;
  const canSend = !isGuest && hasAccess;
  const currentTyping = typingUsers[channelId!] || [];

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0) || !channelId || !user || isUploading) return;

    setIsUploading(true);
    let uploadedAttachments: any[] = [];

    try {
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));
        const res = await api.post("/upload", formData);
        uploadedAttachments = res.data.files;
      }

      const tempId = Math.random().toString(36).substring(7);

      useMessageStore.getState().addOptimisticMessage(channelId, {
        id: tempId,
        tempId,
        channel_id: channelId,
        sender_id: user.id || "",
        content: input.trim(),
        message_type: "text",
        is_deleted: false,
        parent_id: replyingTo?.id || null,
        created_at: new Date().toISOString(),
        sender: { id: user.id || "", username: user.username || "You", role: user.role || "learner" },
        attachments: uploadedAttachments,
        parent: replyingTo ? { id: replyingTo.id, content: replyingTo.content, sender: replyingTo.sender } : undefined,
      });

      sendMessage(channelId, input.trim(), "text", replyingTo?.id, tempId, uploadedAttachments);
      setInput("");
      setFiles([]);
      setReplyingTo(null);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Voice recording (unchanged from previous BatchChatPage, just using channelId)
  const startRecording = async () => {
    if (!channelId || isUploading) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Recording requires a secure (HTTPS) connection or is not supported by your browser.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const supportedType = types.find((t) => MediaRecorder.isTypeSupported(t));
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      const targetChannelId = channelId;
      const finalMimeType = recorder.mimeType || "audio/webm";

      recorder.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: finalMimeType });
        if (blob.size < 100) {
          toast.error("Recording was too short");
          return;
        }
        const ext = finalMimeType.includes("mp4") ? "mp4" : finalMimeType.includes("ogg") ? "ogg" : "webm";
        const file = new window.File([blob], `voice_${Date.now()}.${ext}`, { type: finalMimeType });
        const formData = new FormData();
        formData.append("files", file);
        const tempId = Math.random().toString(36).substring(7);

        try {
          setIsUploading(true);
          if (targetChannelId && user) {
            useMessageStore.getState().addOptimisticMessage(targetChannelId, {
              id: tempId,
              tempId,
              channel_id: targetChannelId,
              sender_id: user.id,
              content: "",
              message_type: "file",
              is_deleted: false,
              parent_id: null,
              created_at: new Date().toISOString(),
              sender: { id: user.id, username: user.username, role: user.role },
              attachments: [{ id: "temp-" + tempId, file_url: "", file_name: file.name, file_size: file.size, mime_type: finalMimeType }],
            });
          }
          const res = await api.post("/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
          if (targetChannelId) {
            sendMessage(targetChannelId, "", "file", undefined, tempId, res.data.files);
          }
        } catch (err) {
          console.error("Voice upload failed:", err);
          if (targetChannelId) useMessageStore.getState().removeOptimisticMessage(targetChannelId, tempId);
          toast.error("Voice note failed to send");
        } finally {
          setIsUploading(false);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      console.error("Mic access error:", err);
      stream?.getTracks().forEach((t) => t.stop());
      toast.error("Microphone access denied or error occurred");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
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
      const validFiles = selectedFiles.filter((f) => f.size <= 50 * 1024 * 1024);
      setFiles((prev) => [...prev, ...validFiles].slice(0, 10));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Mention dropdown
  const filteredMentions = useMemo(() => {
    if (!members || !mentionQuery) return members || [];
    return members.filter((m: any) => m.user.username.toLowerCase().includes(mentionQuery.toLowerCase()));
  }, [members, mentionQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    handleTyping();
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery("");
    }
  };

  const insertMention = (username: string) => {
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const newBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_.-]*)$/, `@${username} `);
    setInput(newBefore + textAfterCursor);
    setShowMentionDropdown(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionDropdown && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((p) => Math.min(p + 1, filteredMentions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMentions[mentionIndex].user.username); return; }
      if (e.key === "Escape") { setShowMentionDropdown(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTyping = () => {
    if (!channelId) return;
    startTyping(channelId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopTyping(channelId), 2000);
  };
  const handlePin = async (id: string) => { try { await api.post(`/messages/${id}/pin`); } catch {} };
  const handleFlag = async (id: string) => { try { await api.post(`/messages/${id}/flag`, { priority: "medium" }); } catch {} };
  const handleDelete = async (id: string) => { try { await api.delete(`/messages/${id}`); } catch {} };
  const rc = (role: string) => role === "admin" ? "text-[oklch(0.70_0.15_25)]" : role === "mentor" ? "text-[oklch(0.78_0.12_215)]" : role === "moderator" ? "text-[oklch(0.70_0.16_290)]" : "text-muted";

  const startDmWith = async (targetUserId: string) => {
    if (targetUserId === user?.id) return;
    try {
      const { data } = await api.post("/dm/conversations", { targetUserId });
      navigate(`/dm/${data.id}`);
    } catch (err) {
      console.error("Failed to start DM:", err);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-surface text-primary relative overflow-hidden" style={{ background: "var(--ax-bg)" }}>
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-30 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      {/* Channel sidebar (this batch's channels) */}
      <aside className={`${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:relative inset-y-0 left-0 z-40 w-60 figma-panel border-y-0 border-l-0 flex min-h-0 flex-col shrink-0 transition-transform duration-300 ease-in-out lg:flex lg:h-full`} style={{ borderRadius: 0 }}>
        <div className="p-3.5 border-b border-hairline space-y-2">
          <Link to={`/batch/${batchId}`} className="flex items-center gap-2 text-dim hover:text-primary text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {batch?.name || "Batch"}
          </Link>
          <Link to="/dm" className="flex items-center gap-2 text-accent-400 hover:text-accent-300 text-sm relative transition-colors">
            <MessageCircle className="w-4 h-4" />
            Direct Messages
            {totalUnreadDm > 0 && <span className="ml-auto w-5 h-5 bg-accent-400 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{totalUnreadDm}</span>}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
          <div className="t-overline px-2.5 py-1.5">Channels</div>
          {channels?.map((c: any) => (
            <Link
              key={c.id}
              to={`/batch/${batchId}/channel/${c.id}`}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[13px] transition-all ${c.id === channelId ? "bg-accent-100 text-accent-300 border border-accent-200 font-semibold" : "text-muted hover:text-primary hover:bg-surface-100 border border-transparent"}`}
            >
              <Hash className="w-[13px] h-[13px] shrink-0 text-dim" />
              <span className="truncate flex-1">{c.name}</span>
              {c.is_pinned && <Pin className="w-2.5 h-2.5 text-accent-400" />}
            </Link>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex min-h-0 flex-col min-w-0">
        <header
          className="h-16 border-b border-hairline flex items-center justify-between px-6 shrink-0 z-20"
          style={{ backgroundColor: "rgba(10,12,17,0.6)", backdropFilter: "blur(24px)" }}>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setIsMobileSidebarOpen(true)} className="p-2 -ml-2 text-dim hover:text-primary lg:hidden">
              <Hash className="w-6 h-6" />
            </button>
            <Hash className="w-4 h-4 text-dim hidden lg:block" />
            <div>
              <h2 className="text-sm font-semibold truncate max-w-[150px] sm:max-w-none">{channel?.name || "Channel"}</h2>
              <div className="text-[11px] text-dim font-normal">{members?.length || 0} members</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationDropdown />
            <button className="btn-ghost p-2 rounded-lg" aria-label="Search messages"><Search className="w-4 h-4" /></button>
            <button onClick={toggleRightPanel} className="btn-ghost p-2 rounded-lg" aria-label={rightPanelOpen ? "Close side panel" : "Open side panel"}>
              {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div ref={messagesScrollRef} className="figma-scroll custom-scrollbar px-4 py-4 space-y-1">
          {isGuest && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-[10px] p-3 mb-4 text-center">
              <p className="text-amber-300 text-sm">
                Guest mode. <Link to="/register" className="underline">Sign up</Link> for full access.
              </p>
            </div>
          )}
          {noAccess && !isGuest && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-center">
              <p className="text-red-300 text-sm flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" />
                You don't have access to this channel. Ask an admin to add you.
              </p>
            </div>
          )}
          {channelMessages.length === 0 && !noAccess && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-surface-100 flex items-center justify-center mb-3">
                <MessageCircle className="w-6 h-6 text-faint" />
              </div>
              <p className="text-sm text-dim">No messages yet</p>
              <p className="text-xs text-faint mt-1">Be the first to share an update or drop a file.</p>
            </div>
          )}
          {channelMessages.map((msg) => {
            const isMe = String(msg.sender_id).toLowerCase() === String(user?.id).toLowerCase();
            return (
              <div key={msg.id} className={`group flex gap-3 py-1.5 px-2 hover:bg-white/[0.02] rounded-lg msg-enter ${msg.isOptimistic ? "is-optimistic" : ""} ${isMe ? "flex-row-reverse" : ""}`}>
                {!isMe && (
                  <button onClick={() => startDmWith(msg.sender_id)} className="avatar w-9 h-9 text-[13px] shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-accent-400/50 transition-all" title={`Message ${msg.sender.username}`}>
                    {msg.sender.username[0].toUpperCase()}
                  </button>
                )}
                <div className={`min-w-0 flex-1 ${isMe ? "text-right" : ""}`}>
                  <div className={`flex items-baseline gap-2 ${isMe ? "justify-end" : ""}`}>
                    {!isMe && <button onClick={() => startDmWith(msg.sender_id)} className={`font-semibold text-[13.5px] ${rc(msg.sender.role)} hover:underline cursor-pointer`}>{msg.sender.username}</button>}
                    {!isMe && msg.sender.role && msg.sender.role !== "learner" && msg.sender.role !== "member" && (
                      <span className={`chip ${msg.sender.role === "mentor" ? "chip-mentor" : msg.sender.role === "moderator" ? "chip-mod" : msg.sender.role === "admin" ? "chip-admin" : "chip-muted"}`}>{msg.sender.role}</span>
                    )}
                    <span className="text-[11px] text-dim">{format(new Date(msg.created_at), "HH:mm")}</span>
                  </div>
                  {msg.is_deleted ? <p className="text-dim italic text-sm">[message removed]</p> : (
                    <div>
                      <div className={`inline-block text-left max-w-[85%] px-3.5 py-2.5 rounded-2xl ${isMe ? "bg-gradient-to-b from-accent-300 via-accent-400 to-accent-600 text-white rounded-tr-sm shadow-[0_4px_14px_-4px_rgba(79,124,255,0.45)]" : "bg-surface-100 text-primary border border-hairline rounded-tl-sm"}`}>
                        {msg.parent && (
                          <div className="border-l-2 border-accent-200 pl-2 mb-1 text-xs text-dim bg-accent-50 rounded-r-md py-1 px-1">
                            ↳ <span className="font-semibold text-muted">{msg.parent.sender.username}</span>: {msg.parent.content.slice(0, 60)}
                          </div>
                        )}
                        {msg.content && <p className="text-sm whitespace-pre-wrap break-words"><MentionText content={msg.content} members={members} /></p>}
                        {msg.attachments?.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.attachments.map((a: any) => {
                              const isImage = a.mime_type?.startsWith("image/");
                              const isAudio = a.mime_type?.startsWith("audio/");
                              if (isAudio)
                                return (
                                  <div key={a.id} className="flex items-center gap-2 p-2 bg-surface-100 rounded-lg border border-hairline">
                                    <Mic className="w-4 h-4 text-accent-400 shrink-0" />
                                    {a.file_url ? (
                                      <audio controls className="h-8 w-48" src={`${import.meta.env.VITE_SOCKET_URL}${a.file_url}`} />
                                    ) : (
                                      <div className="flex items-center gap-2 px-2 text-xs text-dim">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Sending...
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
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                          {Object.entries(
                            msg.reactions.reduce((acc: any, r: any) => {
                              acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, users: [], hasMe: false };
                              acc[r.emoji].count++;
                              acc[r.emoji].users.push(r.user.username);
                              if (r.user_id === user?.id) acc[r.emoji].hasMe = true;
                              return acc;
                            }, {})
                          ).map(([emoji, data]: [string, any]) => (
                            <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} title={data.users.join(", ")} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all cursor-pointer ${data.hasMe ? "bg-accent-100 border-accent-200 text-accent-300" : "bg-surface-100 border-hairline text-muted hover:bg-surface-200"}`}>
                              <span>{emoji}</span>
                              <span className="text-[10px] font-medium">{data.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!msg.is_deleted && !isGuest && (
                  <div className={`opacity-0 group-hover:opacity-100 flex items-start gap-0.5 shrink-0 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div className="relative">
                      <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} className="p-1 text-faint hover:text-yellow-400" aria-label="Add reaction"><Smile className="w-3.5 h-3.5" /></button>
                      {showEmojiPicker === msg.id && (
                        <div className={`absolute bottom-full mb-1 ${isMe ? "right-0" : "left-0"} bg-surface-50 border border-hairline rounded-lg shadow-xl p-1 flex gap-0.5 z-50 animate-in fade-in duration-100`}>
                          {EMOJI_SET.map((e) => (
                            <button key={e} onClick={() => { toggleReaction(msg.id, e); setShowEmojiPicker(null); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-100 transition-colors text-base">{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setReplyingTo(msg); textareaRef.current?.focus(); }} className="p-1 text-faint hover:text-blue-400" aria-label="Reply"><Reply className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handlePin(msg.id)} className="p-1 text-faint hover:text-accent-400" aria-label="Pin message"><Pin className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleFlag(msg.id)} className="p-1 text-faint hover:text-amber-400" aria-label="Flag message"><Flag className="w-3.5 h-3.5" /></button>
                    {(msg.sender_id === user?.id || user?.role === "admin") && <button onClick={() => handleDelete(msg.id)} className="p-1 text-faint hover:text-red-400" aria-label="Delete message"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <TypingIndicator users={currentTyping} />
        {canSend ? (
          <div className="shrink-0 p-4 border-t border-hairline flex flex-col gap-2" style={{ background: "rgba(5,7,10,0.42)" }}>
            {replyingTo && (
              <div className="flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-[10px] px-3 py-2">
                <Reply className="w-4 h-4 text-accent-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-accent-300 uppercase tracking-widest">Replying to {replyingTo.sender.username}</p>
                  <p className="text-xs text-dim truncate">{replyingTo.content.slice(0, 80)}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 text-dim hover:text-primary" aria-label="Cancel reply"><X className="w-4 h-4" /></button>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-medium">Recording... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
                <button onClick={stopRecording} className="ml-auto p-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors">
                  <Square className="w-4 h-4" />
                </button>
              </div>
            )}

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-accent-100 text-accent-200 border border-accent-200 px-3 py-1.5 rounded-lg text-sm">
                    {file.type.startsWith("image/") ? <ImageIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="p-0.5 hover:bg-accent-200 rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              {showMentionDropdown && filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-50 border border-hairline rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-2 duration-150">
                  <div className="px-3 py-2 border-b border-hairline bg-surface-100/50">
                    <p className="text-[10px] font-bold text-dim uppercase tracking-widest flex items-center gap-1.5">
                      <AtSign className="w-3 h-3" />Mention a member
                    </p>
                  </div>
                  {filteredMentions.map((m: any, i: number) => (
                    <button key={m.user.id} onClick={() => insertMention(m.user.username)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all ${i === mentionIndex ? "bg-accent-100 text-primary" : "text-muted hover:bg-surface-100"}`}>
                      <span className="avatar avatar-indigo w-7 h-7 text-[10px]">{m.user.username[0].toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{m.user.username}</span>
                      </div>
                      <span className={`chip text-[9px] ${m.role_in_batch === "mentor" ? "chip-mentor" : m.role_in_batch === "moderator" ? "chip-mod" : "chip-learner"}`}>
                        {m.role_in_batch === "member" ? "learner" : m.role_in_batch}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="figma-panel rounded-xl shadow-inner-highlight overflow-hidden">
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="*/*" />
                <div className="px-3.5 py-3">
                  <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1} placeholder={`Message #${channel?.name || "channel"}... (type @ to mention)`} className="w-full bg-transparent text-primary placeholder-faint resize-none focus:outline-none text-[13.5px] leading-relaxed" disabled={isUploading} />
                </div>
                <div className="flex items-center gap-1 px-2 py-1.5 border-t border-hairline">
                  <button onClick={() => fileInputRef.current?.click()} className="btn-ghost p-1.5 rounded-lg" disabled={isUploading} aria-label="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button className="btn-ghost p-1.5 rounded-lg" aria-label="Mention someone"><AtSign className="w-4 h-4" /></button>
                  <button className="btn-ghost p-1.5 rounded-lg" aria-label="Insert emoji"><Smile className="w-4 h-4" /></button>
                  <span className="flex-1" />
                  <span className="text-[11px] text-dim font-normal">
                    <span className="font-mono bg-surface-200 px-1.5 py-px rounded text-[10px]">↵</span> send
                    <span className="mx-1.5">·</span>
                    <span className="font-mono bg-surface-200 px-1.5 py-px rounded text-[10px]">⇧↵</span> newline
                  </span>
                  {!isRecording && (
                    <button onClick={startRecording} className="btn-ghost p-1.5 rounded-lg" title="Record voice note">
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={handleSend} disabled={(!input.trim() && files.length === 0) || isUploading} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[13px] disabled:opacity-40">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Send</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 p-4 border-t border-hairline text-center text-dim text-sm">
            {isGuest ? "Read-only in guest mode. Create an account to participate." : noAccess ? "You don't have access to post in this channel." : "Read-only"}
          </div>
        )}
      </main>

      {rightPanelOpen && (
        <>
          <div className="fixed inset-0 bg-surface/60 z-30 lg:hidden" onClick={toggleRightPanel} />
          <aside className="fixed lg:relative right-0 inset-y-0 z-40 w-[268px] figma-panel border-y-0 border-r-0 flex min-h-0 flex-col shrink-0 transition-all lg:h-full" style={{ borderRadius: 0 }}>
            <div className="px-4 py-3.5 border-b border-hairline">
              <div className="t-overline mb-1">This room</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary flex-1">Members</span>
                <span className="text-[12.5px] text-dim">{members?.length || 0}</span>
                {user?.role === "admin" && batchId && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="btn-ghost p-1 rounded-md text-accent-400 hover:text-accent-300"
                    title="Add learner"
                    aria-label="Add learner"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
              {members?.map((m: any) => (
                <button key={m.id} onClick={() => setSelectedProfileUser(m.user)} className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-surface-100 transition-all text-left cursor-pointer" title={`View ${m.user.username}'s profile`}>
                  <div className="relative flex-shrink-0">
                    <span className="avatar w-7 h-7 text-[11px]">{m.user.username[0].toUpperCase()}</span>
                    <OnlineStatusDot isOnline={onlineUsers.has(m.user.id)} size="sm" className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[12.5px] font-medium truncate block ${m.user.is_banned ? "line-through text-red-400" : "text-primary"}`}>{m.user.username}</span>
                  </div>
                  <span className={`chip text-[9px] ${m.role_in_batch === "mentor" ? "chip-mentor" : m.role_in_batch === "moderator" ? "chip-mod" : "chip-muted"}`}>
                    {m.role_in_batch === "member" ? "learner" : m.role_in_batch}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}

      {showAddMember && batchId && (
        <AddMemberModal
          batchId={batchId}
          channelName={channel?.name || ""}
          existingMemberIds={new Set((members || []).map((m: any) => m.user_id))}
          onClose={() => setShowAddMember(false)}
        />
      )}

      {selectedProfileUser && (
        <UserProfileSidebar user={selectedProfileUser} isOnline={onlineUsers.has(selectedProfileUser.id)} onClose={() => setSelectedProfileUser(null)} onMessage={startDmWith} />
      )}
    </div>
  );
}



/**
 * Admin-only modal for adding a learner to this channel's batch.
 * Membership is at batch level (so they get access to all channels in the batch).
 * Lists CMS users that aren't already members.
 */
function AddMemberModal({
  batchId,
  channelName,
  existingMemberIds,
  onClose,
}: {
  batchId: string;
  channelName: string;
  existingMemberIds: Set<string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"member" | "mentor" | "moderator">("member");

  const { data: usersResp } = useQuery({
    queryKey: ["users-for-add-member"],
    queryFn: async () => (await api.get("/admin/users?limit=200")).data,
  });

  const candidates = useMemo(() => {
    const all = usersResp?.users || [];
    const q = search.trim().toLowerCase();
    return all
      .filter((u: any) => !existingMemberIds.has(u.id))
      .filter(
        (u: any) =>
          !q ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
  }, [usersResp, search, existingMemberIds]);

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/batches/${batchId}/members`, {
        user_id: userId,
        role_in_batch: role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", batchId] });
      toast.success("Member added");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || "Failed to add member"),
  });

  return (
    <div
      className="figma-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="figma-modal-shell max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-primary">Add learner to channel</h3>
            <p className="text-[11px] text-dim mt-0.5">
              #{channelName} — they will gain access to this batch's channels.
            </p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-hairline space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username or email…"
              className="figma-field h-9 pl-9 pr-3 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-dim">Role in batch:</span>
            {(["member", "mentor", "moderator"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all border ${
                  role === r
                    ? "bg-accent-100 text-accent-300 border-accent-200"
                    : "bg-surface-100 text-dim border-hairline hover:text-primary"
                }`}
              >
                {r === "member" ? "learner" : r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {candidates.length === 0 && (
            <p className="text-dim text-xs text-center py-8">
              {search ? "No matching users" : "All users already members"}
            </p>
          )}
          {candidates.map((u: any) => (
            <button
              key={u.id}
              onClick={() => addMember.mutate(u.id)}
              disabled={addMember.isPending}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-100 transition-colors text-left disabled:opacity-50"
            >
              <span className="avatar avatar-indigo w-7 h-7 text-[11px]">
                {u.username[0]?.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-primary truncate">{u.username}</div>
                <div className="text-[11px] text-dim truncate">{u.email}</div>
              </div>
              <span className={`chip text-[9px] ${u.role === "admin" ? "chip-admin" : u.role === "mentor" ? "chip-mentor" : "chip-muted"}`}>
                {u.role}
              </span>
              <Plus className="w-3.5 h-3.5 text-accent-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
