export default function ChatLoading() {
  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="skeleton" style={{ width: "180px", height: "32px" }} />
      </header>
      <div className="chat-messages">
        <div className="skeleton" style={{ width: "60%", height: "60px", borderRadius: "4px" }} />
      </div>
    </div>
  );
}
