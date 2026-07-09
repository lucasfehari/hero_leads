import React from 'react';

function ProfileModal({ isOpen, onClose, profile }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const planName = profile?.data?.plan === 'monthly' ? 'Mensal' : profile?.data?.plan === 'annual' ? 'Anual' : 'Vitalício';
  const expiresAt = profile?.data?.expires_at ? new Date(profile.data.expires_at).toLocaleDateString('pt-BR') : 'Sem expiração';

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-[#131513] border border-[#00FF59]/20 rounded-2xl w-full max-w-sm overflow-hidden shadow-[0_0_40px_rgba(0,255,89,0.05)]">
        {/* Header com fundo estilizado */}
        <div className="relative h-24 bg-gradient-to-r from-[#00FF59]/10 to-[#00FF59]/5 flex items-center justify-center">
          <div className="absolute -bottom-10 w-20 h-20 rounded-full border-4 border-[#131513] bg-[#0a0b0a] overflow-hidden flex items-center justify-center shadow-lg text-[#00FF59]">
            {profile?.profile?.photo ? (
              <img src={profile.profile.photo} className="w-full h-full object-cover" alt="Avatar" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 opacity-50"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            )}
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="pt-14 pb-6 px-6 text-center">
          <h2 className="text-lg font-bold text-white mb-1 font-['Space_Grotesk']">{profile?.profile?.name || 'Meu Perfil'}</h2>
          <p className="text-xs text-[#00FF59] font-semibold tracking-wider uppercase mb-6">{profile?.data?.name || profile?.data?.email}</p>

          <div className="bg-black/40 rounded-xl p-4 text-left border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Plano Ativo</span>
              <span className="text-sm text-white font-medium bg-[#00FF59]/10 px-2 py-0.5 rounded text-[#00FF59]">{planName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Vencimento</span>
              <span className="text-sm text-slate-300 font-medium">{expiresAt}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Status</span>
              <span className="text-sm text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ativa
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;
