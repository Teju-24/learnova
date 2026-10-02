export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: "easeOut" },
};

export const staggerChildren = (delay = 0.06) => ({
  animate: {
    transition: { staggerChildren: delay },
  },
});

export const slideInLeft = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3, ease: "easeOut" },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.25, ease: "easeOut" },
};

export const shake = {
  animate: {
    x: [0, -6, 6, -4, 4, 0],
    transition: { duration: 0.35 },
  },
};