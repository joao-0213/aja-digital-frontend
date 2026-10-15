export function RichText({
  text
}: {
  text: string;
}) {
  return <div className="space-y-3 whitespace-pre-wrap leading-7 text-slate-600">
    {text.split('\n').filter(Boolean).map((line, i) => <p key={i} className={line.startsWith('- ') ? 'ml-5 list-item' : ''}>
      {(line.startsWith('- ') ? line.slice(2) : line).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>
        {part.slice(2, -2)}
      </strong> : part.startsWith('*') && part.endsWith('*') ? <em key={j}>
        {part.slice(1, -1)}
      </em> : part)}
    </p>)}
  </div>;
}
