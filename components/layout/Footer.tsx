export default function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.svg" alt="" className="h-5 w-auto opacity-40" />
          <p className="text-sm text-text-muted">
            Built by{" "}
            <a
              href="https://www.linkedin.com/in/suhaan-khurana-356355275/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-light transition-colors"
            >
              Suhaan
            </a>{" "}
            at{" "}
            <a
              href="https://tse.ucsd.edu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-foreground transition-colors"
            >
              Triton Software Engineering
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
