import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { Button, ButtonDropdown, SpaceBetween, Spinner } from '@cloudscape-design/components';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onGenerateAI: () => void;
  isGenerating: boolean;
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({ 
  content, 
  onChange, 
  onGenerateAI,
  isGenerating
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      BulletList,
      ListItem,
      Bold,
      Italic,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const toggleHeading = useCallback((level: number) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run();
  }, [editor]);

  if (!editor) {
    return <Spinner size="large" />;
  }

  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar">
        <SpaceBetween direction="horizontal" size="xs">
          <ButtonDropdown
            items={[
              { id: 'h1', text: 'Heading 1' },
              { id: 'h2', text: 'Heading 2' },
              { id: 'h3', text: 'Heading 3' },
              { id: 'paragraph', text: 'Paragraph' },
            ]}
            onItemClick={({ detail }) => {
              if (detail.id === 'paragraph') {
                editor.chain().focus().setParagraph().run();
              } else if (detail.id === 'h1') {
                toggleHeading(1);
              } else if (detail.id === 'h2') {
                toggleHeading(2);
              } else if (detail.id === 'h3') {
                toggleHeading(3);
              }
            }}
          >
            Format
          </ButtonDropdown>
          
          <Button
            iconName="bold"
            variant={editor.isActive('bold') ? 'primary' : 'normal'}
            onClick={toggleBold}
          />
          
          <Button
            iconName="italic"
            variant={editor.isActive('italic') ? 'primary' : 'normal'}
            onClick={toggleItalic}
          />
          
          <Button
            iconName="list-ul"
            variant={editor.isActive('bulletList') ? 'primary' : 'normal'}
            onClick={toggleBulletList}
          />
          
          <Button
            variant="primary"
            onClick={onGenerateAI}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                Generating with AI&nbsp;&nbsp;
                <Spinner />
              </>
            ) : (
              "Generate with AI"
            )}
          </Button>
        </SpaceBetween>
      </div>
      
      <div className="editor-content-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default TipTapEditor; 