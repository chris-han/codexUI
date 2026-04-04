import { IconTablerBolt } from '../icons';

interface SidebarThreadControlsProps {
  onNewThread: () => void;
}

function SidebarThreadControls({ onNewThread }: SidebarThreadControlsProps) {
  return (
    <div className="px-3 py-2">
      <button
        onClick={onNewThread}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
      >
        <IconTablerBolt className="w-4 h-4" />
        <span>New Thread</span>
      </button>
    </div>
  );
}

export default SidebarThreadControls;
