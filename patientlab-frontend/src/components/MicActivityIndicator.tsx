import { motion } from 'framer-motion';

interface MicActivityIndicatorProps {
  active: boolean;
}

const variants = {
  idle: { scale: 1 },
  listening: { scale: 1.2 }
};

export default function MicActivityIndicator({ active }: MicActivityIndicatorProps) {
  return (
    <motion.div
      key={active ? 'listening' : 'idle'}
      variants={variants}
      animate={active ? 'listening' : 'idle'}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={`w-6 h-6 rounded-full ${active ? 'bg-red-400' : 'bg-gray-300'}`}
    />
  );
}
