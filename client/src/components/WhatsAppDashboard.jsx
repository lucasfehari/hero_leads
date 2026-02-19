import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';
import { Smartphone, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

const WhatsAppDashboard = () => {
    const [status, setStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState('');
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        socket.on('wa-status', (data) => {
            setStatus(data.status);
            if (data.status === 'connected' || data.status === 'authenticated') {
                setQrCode('');
            }
        });

        socket.on('wa-qr', (qr) => {
            setQrCode(qr);
            setStatus('scan_qr');
        });

        socket.on('wa-queue-status', (data) => {
            // Optional: Handle queue updates here or in Sender component
        });

        return () => {
            socket.off('wa-status');
            socket.off('wa-qr');
        };
    }, []);

    const getStatusColor = () => {
        switch (status) {
            case 'connected':
            case 'authenticated': return 'text-emerald-500';
            case 'scan_qr': return 'text-orange-500';
            case 'disconnected': return 'text-slate-500';
            default: return 'text-red-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'connected': return 'Conectado & Pronto';
            case 'authenticated': return 'Autenticado';
            case 'scan_qr': return 'Escaneie o QR Code';
            case 'disconnected': return 'Desconectado';
            default: return 'Erro / Desconhecido';
        }
    };

    return (
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-6 h-6 text-green-500" /> WhatsApp Conexão
                </h2>
                <div className={`flex items-center gap-2 font-mono text-sm ${getStatusColor()}`}>
                    {status === 'connected' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {getStatusText()}
                </div>
            </div>

            <div className="flex flex-col items-center justify-center min-h-[300px] bg-slate-950/50 rounded-xl border border-white/5 p-8">
                {status === 'connected' || status === 'authenticated' ? (
                    <div className="text-center space-y-4">
                        <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Smartphone className="w-12 h-12 text-emerald-500" />
                        </div>
                        <h3 className="text-lg font-medium text-white">Pronto para Enviar</h3>
                        <p className="text-slate-400 text-sm max-w-xs mx-auto">
                            Sessão ativa e persistente. O bot manterá a conexão mesmo se o servidor reiniciar.
                        </p>
                    </div>
                ) : qrCode ? (
                    <div className="text-center space-y-4">
                        <div className="bg-white p-4 rounded-lg inline-block">
                            <QRCode value={qrCode} size={256} />
                        </div>
                        <p className="text-slate-400 text-sm animate-pulse">
                            Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar
                        </p>
                    </div>
                ) : (
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-10 h-10 text-slate-600 animate-spin mx-auto" />
                        <p className="text-slate-500 text-sm">Aguardando QR Code do Servidor...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppDashboard;
