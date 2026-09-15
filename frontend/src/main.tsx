import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center">
      <section className="max-w-xl p-10 rounded-2xl bg-slate-900 border border-slate-800">
        <p className="text-cyan-400 font-semibold">forge scaffold</p>
        <h1 className="text-4xl font-bold mt-2">LAPIS</h1>
        <p className="text-slate-400 mt-4">React, TypeScript, Vite, and Tailwind are configured. Add product behavior here.</p>
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)

