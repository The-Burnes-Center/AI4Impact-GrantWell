import React from "react";

interface ContentBoxProps {
  children: React.ReactNode;
  variant?: "card" | "band";
}

const ContentBox = React.memo(function ContentBox({
  children,
  variant = "card",
}: ContentBoxProps) {
  const className =
    variant === "band" ? "content-box content-box--band" : "content-box";
  return (
    <div className={className}>
      <div className="content-box__inner">{children}</div>
    </div>
  );
});

export default ContentBox;
