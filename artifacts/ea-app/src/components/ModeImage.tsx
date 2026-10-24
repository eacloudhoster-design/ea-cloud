import { useLayoutEffect, useRef, type ImgHTMLAttributes } from "react";

/** Keep the existing image box/attributes. A decoded shared source changes in
 * one React commit; a light arrival fade never leaves an empty image frame. */
export default function ModeImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const image = useRef<HTMLImageElement>(null);
  const previous = useRef(props.src);
  useLayoutEffect(() => {
    const changed = previous.current !== props.src;
    previous.current = props.src;
    const node = image.current;
    if (
      !changed ||
      !node ||
      props.style?.opacity === 0 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const opacity = Number(getComputedStyle(node).opacity);
    if (!opacity) return;
    const animation = node.animate([{ opacity: opacity * 0.9 }, { opacity }], {
      duration: 200,
      easing: "ease-out",
    });
    return () => animation.cancel();
  }, [props.src]);
  return <img {...props} ref={image} />;
}
