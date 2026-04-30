import React from "react";

interface ContentBoxProps {
  children: React.ReactNode;
  backgroundColor?: string;
}

const ContentBox = React.memo(function ContentBox({
  children,
  backgroundColor = "#f1f6f9",
}: ContentBoxProps) {
  return (
  <div className="content-box" style={{ backgroundColor }}>
    <div className="content-box__inner">{children}</div>
  </div>
  );
});

export default ContentBox;
