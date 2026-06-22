import React, { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';

const WebcamMaskEditor = ({ videoFile, initialConfig, onSave, onCancel }) => {
    // initialConfig = { relX, relY, relW, relH, aspectRatio }
    const [bounds, setBounds] = useState({ width: 800, height: 450 });
    const containerRef = useRef();

    // Default to a 27% width mask in bottom right
    const [mask, setMask] = useState({
        x: initialConfig?.relX ? initialConfig.relX * 800 : 800 * 0.7,
        y: initialConfig?.relY ? initialConfig.relY * 450 : 450 * 0.7,
        width: initialConfig?.relW ? initialConfig.relW * 800 : 800 * 0.27,
        height: initialConfig?.relH ? initialConfig.relH * 450 : 450 * 0.30
    });

    useEffect(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setBounds({ width: rect.width, height: rect.height });
            // Adjust mask to real container bounds
            setMask({
                x: initialConfig?.relX ? initialConfig.relX * rect.width : rect.width * 0.7,
                y: initialConfig?.relY ? initialConfig.relY * rect.height : rect.height * 0.65,
                width: initialConfig?.relW ? initialConfig.relW * rect.width : rect.width * 0.27,
                height: initialConfig?.relH ? initialConfig.relH * rect.height : rect.height * 0.30
            });
        }
    }, [initialConfig]);

    const handleSave = () => {
        const relX = mask.x / bounds.width;
        const relY = mask.y / bounds.height;
        const relW = mask.width / bounds.width;
        const relH = mask.height / bounds.height;
        
        let position = 'bottom-right';
        if (relX < 0.5 && relY < 0.5) position = 'top-left';
        if (relX >= 0.5 && relY < 0.5) position = 'top-right';
        if (relX < 0.5 && relY >= 0.5) position = 'bottom-left';

        onSave({ position, relX, relY, relW, relH, hasFace: true });
    };

    const videoUrl = videoFile?.path ? `http://localhost:3000/api/clips/stream?path=${encodeURIComponent(videoFile.path)}` : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-5xl space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Prancheta: Webcam & Layout</h2>
                        <p className="text-slate-400 text-sm">Arraste e redimensione o quadrado roxo para cobrir seu rosto no vídeo original.</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onCancel} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700">Cancelar</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium shadow-lg shadow-purple-500/20 hover:bg-purple-500">Salvar Máscara</button>
                    </div>
                </div>

                <div 
                    ref={containerRef}
                    className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10"
                >
                    {/* Fake video background if no real frame is available */}
                    {!videoUrl && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-700">
                            (Vídeo indísponivel. Arraste a área baseando-se na proporção.)
                        </div>
                    )}

                    {videoUrl && (
                        <video 
                            src={videoUrl} 
                            controls 
                            poster={`http://localhost:3000/api/clips/preview?path=${encodeURIComponent(videoFile.path)}`}
                            className="absolute inset-0 w-full h-full object-contain pointer-events-auto"
                        />
                    )}

                    <Rnd
                        bounds="parent"
                        size={{ width: mask.width, height: mask.height }}
                        position={{ x: mask.x, y: mask.y }}
                        lockAspectRatio={true}
                        onDragStop={(e, d) => setMask({ ...mask, x: d.x, y: d.y })}
                        onResizeStop={(e, direction, ref, delta, position) => {
                            const size = Math.max(parseFloat(ref.style.width), parseFloat(ref.style.height));
                            setMask({ width: size, height: size, ...position });
                        }}
                        className="group cursor-move flex items-center justify-center"
                    >
                        {/* The Cutout and Dimmer (dimming everything outside the circle) */}
                        <div className="absolute inset-0 rounded-full border-[3px] border-emerald-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none transition-all" />
                        
                        {/* Crosshairs & Helper Text */}
                        <div className="z-20 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="w-12 h-12 rounded-full border border-white/50 border-dashed mb-1 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            </div>
                            <span className="text-white text-[10px] font-bold tracking-wider uppercase drop-shadow-md bg-black/50 px-2 py-0.5 rounded-full">Seu Rosto</span>
                        </div>

                        {/* Corner handles (styled as camera framing corners) */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-[3px] border-l-[3px] border-white z-20 pointer-events-none" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-[3px] border-r-[3px] border-white z-20 pointer-events-none" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-[3px] border-l-[3px] border-white z-20 pointer-events-none" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-[3px] border-r-[3px] border-white z-20 pointer-events-none" />
                    </Rnd>
                </div>
            </div>
        </div>
    );
};

export default WebcamMaskEditor;
