async function getStarCount() {
  try {
    const res = await fetch("https://api.github.com/repos/GithubAnant/claudefm", {
      next: { revalidate: 3600 }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.stargazers_count as number;
  } catch {
    return null;
  }
}

export async function StarCount() {
  const count = await getStarCount();
  if (count === null) return null;
  return <span>[<span style={{ color: "var(--foreground)", padding: "0 2px" }}>{count.toLocaleString()}</span>]</span>;
}
