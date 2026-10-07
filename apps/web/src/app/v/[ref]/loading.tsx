export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8" aria-busy="true" aria-label="Loading the report">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-6 w-72" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full" />)}
    </div>
  );
}
