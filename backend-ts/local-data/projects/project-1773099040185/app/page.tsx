export default function Home() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section - iPhone 16 Pro Style */}
      <section className="relative h-[80vh] md:h-[90vh] bg-black flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div className="z-10 animate-fade-in">
          <h1 className="text-white text-4xl md:text-6xl font-semibold tracking-tight mb-2">
            iPhone 16 Pro
          </h1>
          <p className="text-white text-xl md:text-2xl font-light mb-6">
            Incredibilmente potente. Incredibilmente sottile.
          </p>
          <div className="flex justify-center space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white hover:bg-[#0077ed]">
              Scopri di più
            </button>
            <button className="apple-btn border border-[#0071e3] text-[#2997ff] hover:bg-[#0071e3] hover:text-white">
              Acquista
            </button>
          </div>
        </div>
        <div className="mt-12 w-full max-w-md">
           <div className="aspect-[9/16] bg-gradient-to-b from-gray-800 to-black rounded-[3rem] border-4 border-gray-700 shadow-2xl mx-auto relative">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-6 bg-black rounded-full"></div>
              <div className="flex items-center justify-center h-full text-gray-500 text-sm italic">
                [Immagine Prodotto]
              </div>
           </div>
        </div>
      </section>

      {/* Secondary Hero - iPad Style */}
      <section className="mt-3 bg-[#f5f5f7] py-20 px-6 text-center">
        <h2 className="text-black text-4xl md:text-5xl font-semibold tracking-tight mb-2">
          iPad Pro
        </h2>
        <p className="text-gray-800 text-xl md:text-2xl font-light mb-6">
          Sottile da non credere. Potente da non crederci.
        </p>
        <div className="flex justify-center space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white">Scopri di più</button>
            <button className="apple-btn border border-[#0071e3] text-[#0071e3]">Acquista</button>
        </div>
        <div className="mt-10 max-w-4xl mx-auto">
          <div className="aspect-video bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center">
             <span className="text-gray-300 text-4xl">iPad Pro Display</span>
          </div>
        </div>
      </section>

      {/* Grid Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
        {/* Watch */}
        <div className="bg-black h-[500px] rounded-2xl flex flex-col items-center justify-center text-center p-8">
          <h3 className="text-white text-3xl font-semibold mb-2">WATCH</h3>
          <p className="text-red-500 text-sm font-bold uppercase tracking-widest mb-2">SERIES 10</p>
          <p className="text-white text-lg mb-6">Sottile. Evoluto. Inarrestabile.</p>
          <div className="flex space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white text-sm">Scopri di più</button>
            <button className="apple-btn border border-[#0071e3] text-[#2997ff] text-sm">Acquista</button>
          </div>
        </div>

        {/* MacBook Air */}
        <div className="bg-white h-[500px] rounded-2xl flex flex-col items-center justify-center text-center p-8 border border-gray-100">
          <h3 className="text-black text-3xl font-semibold mb-2">MacBook Air</h3>
          <p className="text-gray-600 text-lg mb-6">Superleggero. Super M3.</p>
          <div className="flex space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white text-sm">Scopri di più</button>
            <button className="apple-btn border border-[#0071e3] text-[#0071e3] text-sm">Acquista</button>
          </div>
        </div>

        {/* AirPods */}
        <div className="bg-[#f5f5f7] h-[500px] rounded-2xl flex flex-col items-center justify-center text-center p-8">
          <h3 className="text-black text-3xl font-semibold mb-2">AirPods Pro</h3>
          <p className="text-gray-600 text-lg mb-6">Cancellazione del rumore di un altro livello.</p>
          <div className="flex space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white text-sm">Scopri di più</button>
            <button className="apple-btn border border-[#0071e3] text-[#0071e3] text-sm">Acquista</button>
          </div>
        </div>

        {/* Vision Pro */}
        <div className="bg-white h-[500px] rounded-2xl flex flex-col items-center justify-center text-center p-8 border border-gray-100">
          <h3 className="text-black text-3xl font-semibold mb-2">Vision Pro</h3>
          <p className="text-gray-600 text-lg mb-6">Benvenuti nell'era dello spatial computing.</p>
          <div className="flex space-x-4">
            <button className="apple-btn bg-[#0071e3] text-white text-sm">Scopri di più</button>
            <button className="apple-btn border border-[#0071e3] text-[#0071e3] text-sm">Acquista</button>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-6">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="text-center">
            <div className="text-4xl mb-4">🚚</div>
            <h4 className="text-lg font-semibold mb-2">Consegna gratuita</h4>
            <p className="text-gray-500 text-sm">E resi facili su tutti gli ordini.</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">💳</div>
            <h4 className="text-lg font-semibold mb-2">Finanziamento</h4>
            <p className="text-gray-500 text-sm">Paga a rate senza interessi.</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">🎓</div>
            <h4 className="text-lg font-semibold mb-2">Sconti Education</h4>
            <p className="text-gray-500 text-sm">Risparmia su Mac e iPad per l'università.</p>
          </div>
        </div>
      </section>
    </div>
  );
}