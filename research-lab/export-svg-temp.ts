function exportToSvg(elementId = 'diagram-html', cssContent = '') {
  const targetEl = document.getElementById(elementId);
  const rect = targetEl.getBoundingClientRect();

  const clone = targetEl.cloneNode(true);
  const htmlWrapper = document.createElement('div');
  htmlWrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  htmlWrapper.appendChild(clone);

  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}" viewBox="0 0 ${rect.width} ${rect.height}">
      <style>
        <![CDATA[
          ${cssContent}
        ]]>
      </style>
      <foreignObject width="100%" height="100%">
        ${htmlWrapper.innerHTML}
      </foreignObject>
    </svg>
  `;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diagram.svg';
  a.click();
  URL.revokeObjectURL(url);
}