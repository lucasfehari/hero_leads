import React from 'react';

function LockScreen({ profile }) {
  const handleRenew = () => {
    if (window.electronAPI) {
      window.electronAPI.openExternal('https://browzebot.com.br');
    } else {
      window.open('https://browzebot.com.br', '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-[#0f0f1e] border border-indigo-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-[0_0_80px_rgba(99,102,241,0.15)] mx-4">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2 font-['Space_Grotesk']">
          Licença Expirada
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Olá, {profile?.profile?.name || 'Usuário'}! O seu plano {profile?.data?.plan === 'monthly' ? 'Mensal' : 'Anual'} venceu em{' '}
          <strong className="text-slate-300">
            {new Date(profile?.data?.expires_at).toLocaleDateString('pt-BR')}
          </strong>
          .
        </p>
        <p className="text-slate-400 text-sm mb-8">
          Para continuar utilizando o Browze Bot e automatizando suas vendas, por favor, renove sua assinatura.
        </p>

        <button
          onClick={handleRenew}
          className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25"
        >
          Renovar Agora →
        </button>
      </div>
    </div>
  );
}

export default LockScreen;
