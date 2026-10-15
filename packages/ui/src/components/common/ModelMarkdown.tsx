import ReactMarkdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const modelUrlTransform: UrlTransform = (url) =>
  /^(?:https|mailto):/i.test(url) ? url : null;

const SAFE_COMPONENTS: Components = {
  img({ alt }) {
    return alt ? <>{alt}</> : null;
  },
  a({ href, title, children }) {
    if (!href) return <>{children}</>;
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

interface ModelMarkdownProps {
  children: string;
  className?: string;
  components?: Components;
}

/**
 * Markdown written by the model. Its text can echo grant documents and uploads, so it never
 * loads images (an image URL can carry data out) and links only to https: or mailto: addresses.
 */
export default function ModelMarkdown({ children, className, components }: ModelMarkdownProps) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm]}
      urlTransform={modelUrlTransform}
      components={{ ...components, ...SAFE_COMPONENTS }}
    >
      {children}
    </ReactMarkdown>
  );
}
