import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, CheckCircle, Upload } from 'lucide-react';

const AudioRecorderSlot = ({ audio, onUpdate, onRemove }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                onUpdate({ url: audioUrl, file: audioBlob });
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (error) {
            console.error("Erro ao acessar microfone:", error);
            alert("Não foi possível acessar seu microfone. Verifique as permissões.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (isRecording && mediaRecorderRef.current) mediaRecorderRef.current.stop();
        };
    }, []);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
            {/* TAG IDENTIFIER */}
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 font-mono text-sm text-purple-400 font-bold shrink-0">
                {audio.id}
            </div>

            {/* RECORDING CONTROLS */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
                {!isRecording ? (
                    <>
                        <button
                            type="button"
                            onClick={startRecording}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/20"
                        >
                            <Mic className="w-4 h-4" /> Gravar
                        </button>

                        {!audio.url && (
                            <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg transition-colors border border-blue-500/20 cursor-pointer">
                                <Upload className="w-4 h-4" /> Salvar / Upload
                                <input
                                    type="file"
                                    accept="audio/mp3,audio/wav,audio/webm,audio/ogg,audio/mp4"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const url = URL.createObjectURL(file);
                                            onUpdate({ url, file });
                                        }
                                    }}
                                />
                            </label>
                        )}
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors animate-pulse"
                    >
                        <Square className="w-4 h-4" /> Parar ({formatTime(recordingTime)})
                    </button>
                )}

                {audio.url && !isRecording && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400 text-sm">
                        <CheckCircle className="w-4 h-4" /> Gravado
                    </div>
                )}
            </div>

            {/* PREVIEW */}
            {audio.url && (
                <audio src={audio.url} controls className="h-8 w-48 shrink-0 outline-none" />
            )}

            {/* REMOVE BUTTON */}
            <button
                type="button"
                onClick={onRemove}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Remover Áudio"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
};

export default AudioRecorderSlot;
