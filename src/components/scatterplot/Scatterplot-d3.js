import * as d3 from 'd3';
import { formatAttributeLabel, formatMetric } from '../../utils/formatting';

const TAU = Math.PI * 2;
const RISK_COLORMAP = (value) => d3.interpolateRdYlGn(0.08 + (1 - value) * 0.84);

class ScatterplotD3 {
  margin = { top: 20, right: 24, bottom: 64, left: 72 };
  defaultOpacity = 0.74;
  fadedOpacity = 0.32;
  selectedOpacity = 0.94;
  selectedWhileHoveringOpacity = 0.62;
  hoverOpacity = 0.98;
  transitionDuration = 140;
  circleRadius = 2.45;
  selectedRadius = 3.05;
  hoveredRadius = 3.45;
  defaultPointStroke = 'rgba(0, 0, 0, 0)';
  selectedPointStroke = '#111111';
  hoveredPointStroke = '#111111';
  riskColorScale = d3.scaleSequential(RISK_COLORMAP)
    .domain([0, 1])
    .clamp(true);

  constructor(el) {
    this.el = el;
    this.visData = [];
    this.projectedPoints = [];
    this.pointsByIndex = new Map();
    this.selectedIndexes = new Set();
    this.hoveredIndexes = new Set();
    this.isBrushing = false;
    this.isClearingBrush = false;
    this.previewFrame = null;
    this.pendingPreview = null;
    this.pointerFrame = null;
    this.pendingPointer = null;
    this.tooltipHoverIndex = null;
    this.tooltipContentIndex = null;
    this.delaunay = null;
    this.lastInteractionSignature = '';
    this.suppressClickUntil = 0;
  }

  create(config) {
    this.size = {
      width: config.size.width ?? 640,
      height: config.size.height ?? 360,
    };
    this.width = this.size.width - this.margin.left - this.margin.right;
    this.height = this.size.height - this.margin.top - this.margin.bottom;
    this.pixelRatio = window.devicePixelRatio || 1;

    // this wrapper keeps canvas, svg and tooltip locked to the same box
    this.stage = d3.select(this.el)
      .append('div')
      .attr('class', 'scatterplotStage')
      .style('width', `${this.size.width}px`)
      .style('height', `${this.size.height}px`)
      .style('position', 'relative');

    this.tooltip = this.stage
      .append('div')
      .attr('class', 'chartTooltip scatterplotTooltip');

    this.canvas = this.stage
      .append('canvas')
      .attr('class', 'scatterplotCanvas')
      .style('left', `${this.margin.left}px`)
      .style('top', `${this.margin.top}px`)
      .style('width', `${this.width}px`)
      .style('height', `${this.height}px`);

    this.ctx = this.configureCanvas(this.canvas.node(), this.width, this.height);

    // svg still does the "structural" stuff better: axes, labels and brush overlay
    this.svg = this.stage
      .append('svg')
      .attr('class', 'scatterplotSvg')
      .attr('width', this.size.width)
      .attr('height', this.size.height);

    this.plotG = this.svg
      .append('g')
      .attr('class', 'plotG')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    this.plotG
      .append('rect')
      .attr('class', 'plotFrame')
      .attr('width', this.width)
      .attr('height', this.height);

    this.xScale = d3.scaleLinear().range([0, this.width]);
    this.yScale = d3.scaleLinear().range([this.height, 0]);

    this.plotG
      .append('g')
      .attr('class', 'xAxisG')
      .attr('transform', `translate(0,${this.height})`);

    this.plotG
      .append('g')
      .attr('class', 'yAxisG');

    this.plotG
      .append('g')
      .attr('class', 'brushG');

    this.svg
      .append('text')
      .attr('class', 'axisLabel axisLabelX')
      .attr('x', this.margin.left + this.width / 2)
      .attr('y', this.margin.top + this.height + 46)
      .attr('text-anchor', 'middle');

    this.svg
      .append('text')
      .attr('class', 'axisLabel axisLabelY')
      .attr('transform', `translate(22,${this.margin.top + this.height / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle');

    this.brush = d3.brush()
      .extent([[0, 0], [this.width, this.height]])
      .on('start brush end', (event) => this.handleBrush(event));

    this.plotG.select('.brushG').call(this.brush);

    // hover lives on the brush overlay so it still works across the whole plot area
    this.plotG.select('.brushG .overlay')
      .on('mousemove.tooltip', (event) => this.handlePointerMove(event))
      .on('mouseleave.tooltip', () => this.handlePointerLeave())
      .on('click.select', (event) => this.handlePointerClick(event));
  }

  configureCanvas(canvasNode, width, height) {
    canvasNode.width = Math.round(width * this.pixelRatio);
    canvasNode.height = Math.round(height * this.pixelRatio);

    const context = canvasNode.getContext('2d');
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.imageSmoothingEnabled = false;
    return context;
  }

  buildProjectedPoints() {
    // precompute screen pos + risk color once, no need to redo that on every hover
    this.projectedPoints = this.visData.map((item) => ({
      item,
      index: item.index,
      x: this.xScale(item[this.xAttribute]),
      y: this.yScale(item[this.yAttribute]),
      color: this.getRiskColor(item),
    }));

    this.pointsByIndex = new Map(
      this.projectedPoints.map((point) => [point.index, point]),
    );

    // delaunay makes nearest-point hover much cheaper than scanning the full set
    this.delaunay = this.projectedPoints.length > 0
      ? d3.Delaunay.from(this.projectedPoints, (point) => point.x, (point) => point.y)
      : null;
  }

  createLayer(opacity) {
    const layerCanvas = document.createElement('canvas');
    const layerContext = this.configureCanvas(layerCanvas, this.width, this.height);

    // static layers are cached bitmaps, later interaction redraws just reuse them
    this.drawRiskPointsBatch(layerContext, this.projectedPoints, {
      radius: this.circleRadius,
      stroke: this.defaultPointStroke,
      strokeWidth: 0,
      opacity,
    });

    return layerCanvas;
  }

  rebuildBaseLayers() {
    this.normalLayer = this.createLayer(this.defaultOpacity);
    this.fadedLayer = this.createLayer(this.fadedOpacity);
  }

  getRiskColor(point) {
    const crimeValue = point.item?.ViolentCrimesPerPop ?? point?.ViolentCrimesPerPop ?? 0;
    return this.riskColorScale(crimeValue);
  }

  getInteractionSignature(selectedIndexes, hoveredIndexes) {
    return `${Array.from(selectedIndexes).join(',')}|${Array.from(hoveredIndexes).join(',')}`;
  }

  drawPointsBatch(context, points, style) {
    if (points.length === 0) {
      return;
    }

    context.save();
    context.globalAlpha = style.opacity;
    context.fillStyle = style.fill;
    context.beginPath();

    points.forEach((point) => {
      context.moveTo(point.x + style.radius, point.y);
      context.arc(point.x, point.y, style.radius, 0, TAU);
    });

    context.fill();

    if (style.strokeWidth > 0) {
      context.strokeStyle = style.stroke;
      context.lineWidth = style.strokeWidth;
      context.stroke();
    }

    context.restore();
  }

  drawRiskPointsBatch(context, points, style) {
    if (points.length === 0) {
      return;
    }

    // colors are already attached to each point, so this path stays kinda cheap
    context.save();
    context.globalAlpha = style.opacity;
    context.lineWidth = style.strokeWidth;

    points.forEach((point) => {
      context.beginPath();
      context.fillStyle = style.fill ?? point.color ?? this.getRiskColor(point);
      context.arc(point.x, point.y, style.radius, 0, TAU);
      context.fill();

      if (style.strokeWidth > 0) {
        context.strokeStyle = style.stroke;
        context.stroke();
      }
    });

    context.restore();
  }

  getPointsForIndexes(indexes) {
    // map lookup is faster and cleaner than rescanning projectedPoints each time
    return Array.from(indexes, (index) => this.pointsByIndex.get(index))
      .filter((point) => point !== undefined);
  }

  drawInteractionState(selectedIndexes, hoveredIndexes, selectedPoints = null, hoveredPoints = null) {
    this.lastInteractionSignature = this.getInteractionSignature(selectedIndexes, hoveredIndexes);
    this.ctx.clearRect(0, 0, this.width, this.height);

    const hasFocus = selectedIndexes.size > 0 || hoveredIndexes.size > 0;
    // most redraws only swap layers + a small focused subset, not the full plot
    const baseLayer = hasFocus ? this.fadedLayer : this.normalLayer;
    if (baseLayer) {
      this.ctx.drawImage(baseLayer, 0, 0, this.width, this.height);
    }

    if (selectedIndexes.size > 0) {
      const hoveredSelected = hoveredIndexes.size > 0
        ? new Set(Array.from(selectedIndexes).filter((index) => !hoveredIndexes.has(index)))
        : selectedIndexes;

      this.drawRiskPointsBatch(
        this.ctx,
        selectedPoints ?? this.getPointsForIndexes(hoveredSelected),
        {
          radius: this.selectedRadius,
          stroke: this.selectedPointStroke,
          strokeWidth: 0.7,
          opacity: hoveredIndexes.size > 0 ? this.selectedWhileHoveringOpacity : this.selectedOpacity,
        },
      );
    }

    if (hoveredIndexes.size > 0) {
      this.drawRiskPointsBatch(
        this.ctx,
        hoveredPoints ?? this.getPointsForIndexes(hoveredIndexes),
        {
          radius: this.hoveredRadius,
          stroke: this.hoveredPointStroke,
          strokeWidth: 0.9,
          opacity: this.hoverOpacity,
        },
      );
    }
  }

  schedulePreviewInteraction(selectedIndexes, hoveredIndexes, selectedPoints = null, hoveredPoints = null) {
    this.pendingPreview = {
      selectedIndexes,
      hoveredIndexes,
      selectedPoints,
      hoveredPoints,
    };

    if (this.previewFrame !== null) {
      return;
    }

    // brush can spam events a lot, so preview is merged into one frame
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = null;

      if (!this.pendingPreview) {
        return;
      }

      this.drawInteractionState(
        this.pendingPreview.selectedIndexes,
        this.pendingPreview.hoveredIndexes,
        this.pendingPreview.selectedPoints,
        this.pendingPreview.hoveredPoints,
      );
      this.pendingPreview = null;
    });
  }

  getSelectedPointsFromBrush(selection) {
    const [[x0, y0], [x1, y1]] = selection;

    return this.projectedPoints
      .filter((point) => x0 <= point.x && point.x <= x1 && y0 <= point.y && point.y <= y1);
  }

  findNearestPoint(mouseX, mouseY) {
    if (!this.delaunay || this.projectedPoints.length === 0) {
      return null;
    }

    const nearestIndex = this.delaunay.find(mouseX, mouseY);
    const nearestPoint = this.projectedPoints[nearestIndex];

    if (!nearestPoint) {
      return null;
    }

    const dx = nearestPoint.x - mouseX;
    const dy = nearestPoint.y - mouseY;
    const distanceSquared = dx * dx + dy * dy;

    // avoid snapping to a point that is kinda far away from the cursor
    return distanceSquared <= 118 ? nearestPoint : null;
  }

  showTooltip(event, point) {
    if (!this.tooltip) {
      return;
    }

    // same hovered point, just move the box around and skip html work
    if (this.tooltipContentIndex !== point.index) {
      this.tooltip
        .html(`
          <div class="tooltipEyebrow">Observation</div>
          <div class="tooltipTitle">${point.item.communityLabel}</div>
          <div class="tooltipMeta">${point.item.stateName}</div>
          <div class="tooltipGrid">
            <div class="tooltipStat">
              <span>${formatAttributeLabel(this.xAttribute)}</span>
              <strong>${formatMetric(point.item[this.xAttribute])}</strong>
            </div>
            <div class="tooltipStat">
              <span>${formatAttributeLabel(this.yAttribute)}</span>
              <strong>${formatMetric(point.item[this.yAttribute])}</strong>
            </div>
          </div>
        `);
      this.tooltipContentIndex = point.index;
    }

    this.tooltip.classed('is-visible', true);

    const stageRect = this.stage.node().getBoundingClientRect();
    const tooltipNode = this.tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth || 220;
    const tooltipHeight = tooltipNode.offsetHeight || 120;
    const localX = event.clientX - stageRect.left;
    const localY = event.clientY - stageRect.top;
    const left = localX + tooltipWidth + 18 > this.size.width
      ? localX - tooltipWidth - 18
      : localX + 18;
    const top = localY + tooltipHeight + 18 > this.size.height
      ? localY - tooltipHeight - 18
      : localY + 18;

    this.tooltip
      .style('left', `${Math.max(12, left)}px`)
      .style('top', `${Math.max(12, top)}px`);
  }

  hideTooltip() {
    if (!this.tooltip) {
      return;
    }

    this.tooltip.classed('is-visible', false);
  }

  handlePointerMove(event) {
    if (this.isBrushing || !this.controllerMethods?.handleOnMouseEnter) {
      return;
    }

    const [mouseX, mouseY] = d3.pointer(event, this.plotG.node());
    this.pendingPointer = {
      mouseX,
      mouseY,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    if (this.pointerFrame !== null) {
      return;
    }

    // mousemove is throttled to one visual frame, otherwise it gets noisy fast
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = null;

      if (!this.pendingPointer) {
        return;
      }

      const pointer = this.pendingPointer;
      this.pendingPointer = null;
      const nearestPoint = this.findNearestPoint(pointer.mouseX, pointer.mouseY);

      if (!nearestPoint) {
        this.handlePointerLeave();
        return;
      }

      if (this.tooltipHoverIndex !== nearestPoint.index) {
        this.tooltipHoverIndex = nearestPoint.index;
        this.controllerMethods.handleOnMouseEnter(nearestPoint.item);
      }

      this.showTooltip(pointer, nearestPoint);
    });
  }

  handlePointerLeave() {
    this.pendingPointer = null;
    if (this.pointerFrame !== null) {
      cancelAnimationFrame(this.pointerFrame);
      this.pointerFrame = null;
    }
    this.hideTooltip();

    if (this.tooltipHoverIndex !== null && this.controllerMethods?.handleOnMouseLeave) {
      this.tooltipHoverIndex = null;
      this.controllerMethods.handleOnMouseLeave();
    }
  }

  handlePointerClick(event) {
    if (!this.controllerMethods?.handleOnClick || this.isBrushing || Date.now() < this.suppressClickUntil) {
      return;
    }

    const [mouseX, mouseY] = d3.pointer(event, this.plotG.node());
    const nearestPoint = this.findNearestPoint(mouseX, mouseY);

    if (!nearestPoint) {
      return;
    }

    // click uses the same nearest-point logic as hover, keeps canvas interaction simple
    this.controllerMethods.handleOnClick(nearestPoint.item);
  }

  handleBrush(event) {
    if (!this.controllerMethods?.handleOnBrushSelection) {
      return;
    }

    if (this.isClearingBrush) {
      if (event.type === 'end') {
        this.isClearingBrush = false;
      }
      return;
    }

    if (event.type === 'start') {
      this.isBrushing = true;
      this.handlePointerLeave();
    }

    // if the user clears the brush, go back to the shared selection state
    if (!event.selection) {
      this.schedulePreviewInteraction(this.selectedIndexes, this.hoveredIndexes);

      if (event.type === 'end') {
        this.isBrushing = false;
        this.controllerMethods.handleOnBrushSelection([]);
      }
      return;
    }

    const selectedPoints = this.getSelectedPointsFromBrush(event.selection);
    const selectedItems = event.type === 'end'
      ? selectedPoints.map((point) => point.item)
      : null;
    const selectedIndexes = new Set(selectedPoints.map((point) => point.index));
    // during drag we only preview localy, global sync waits for brush end
    this.schedulePreviewInteraction(selectedIndexes, new Set(), selectedPoints, null);

    if (event.type === 'end') {
      this.isBrushing = false;
      // brush end can also produce a click on the overlay, so ignore that tiny overlap
      this.suppressClickUntil = Date.now() + 180;
      this.controllerMethods.handleOnBrushSelection(selectedItems);
      this.clearBrushOverlay();
    }
  }

  clearBrushOverlay() {
    // brush overlay should disappear after commit, old boxes looked pretty confusing
    this.isClearingBrush = true;
    this.plotG.select('.brushG').call(this.brush.move, null);
  }

  updateAxis(visData, xAttribute, yAttribute) {
    const xExtent = d3.extent(visData, (item) => item[xAttribute]);
    const yExtent = d3.extent(visData, (item) => item[yAttribute]);
    const xPadding = ((xExtent[1] ?? 0) - (xExtent[0] ?? 0) || 1) * 0.05;
    const yPadding = ((yExtent[1] ?? 0) - (yExtent[0] ?? 0) || 1) * 0.05;

    // small padding keeps outer points from sticking to the frame
    this.xScale.domain([xExtent[0] - xPadding, xExtent[1] + xPadding]);
    this.yScale.domain([yExtent[0] - yPadding, yExtent[1] + yPadding]);

    this.plotG.select('.xAxisG')
      .call(d3.axisBottom(this.xScale).ticks(6).tickSize(-this.height).tickPadding(10).tickFormat(d3.format('.2f')));

    this.plotG.select('.yAxisG')
      .call(d3.axisLeft(this.yScale).ticks(6).tickSize(-this.width).tickPadding(10).tickFormat(d3.format('.2f')));

    this.svg.select('.axisLabelX').text(formatAttributeLabel(xAttribute));
    this.svg.select('.axisLabelY').text(formatAttributeLabel(yAttribute));
  }

  resetEmptyChart(xAttribute, yAttribute) {
    this.xScale.domain([0, 1]);
    this.yScale.domain([0, 1]);
    this.projectedPoints = [];
    this.pointsByIndex = new Map();
    this.normalLayer = null;
    this.fadedLayer = null;

    this.plotG.select('.xAxisG')
      .call(d3.axisBottom(this.xScale).ticks(5).tickSize(-this.height).tickPadding(10).tickFormat(d3.format('.1f')));

    this.plotG.select('.yAxisG')
      .call(d3.axisLeft(this.yScale).ticks(5).tickSize(-this.width).tickPadding(10).tickFormat(d3.format('.1f')));

    this.svg.select('.axisLabelX').text(formatAttributeLabel(xAttribute));
    this.svg.select('.axisLabelY').text(formatAttributeLabel(yAttribute));
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  renderScatterplot(visData, xAttribute, yAttribute, controllerMethods) {
    this.controllerMethods = controllerMethods;
    this.xAttribute = xAttribute;
    this.yAttribute = yAttribute;
    this.visData = visData.filter(
      (item) => Number.isFinite(item[xAttribute]) && Number.isFinite(item[yAttribute]),
    );

    // drop broken rows only for this view, the shared dataset stays untouched
    if (this.visData.length === 0) {
      this.resetEmptyChart(xAttribute, yAttribute);
      this.hideTooltip();
      return;
    }

    this.updateAxis(this.visData, xAttribute, yAttribute);
    this.buildProjectedPoints();
    this.rebuildBaseLayers();
    // use the latest shared selection right after render, so both charts stay aligned
    this.drawInteractionState(this.selectedIndexes, this.hoveredIndexes);
  }

  syncInteractionState(selectedItems, hoveredItems) {
    this.selectedIndexes = new Set(selectedItems.map((item) => item.index));
    this.hoveredIndexes = new Set(hoveredItems.map((item) => item.index));

    // local brush preview should win for a moment, redux catches up on brush end
    if (this.isBrushing) {
      return;
    }

    if (this.previewFrame !== null) {
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = null;
      this.pendingPreview = null;
    }

    const nextSignature = this.getInteractionSignature(this.selectedIndexes, this.hoveredIndexes);
    // duplicated syncs just waste redraw time, so skip them
    if (nextSignature === this.lastInteractionSignature) {
      return;
    }

    this.drawInteractionState(this.selectedIndexes, this.hoveredIndexes);
  }

  clear() {
    if (this.previewFrame !== null) {
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = null;
    }

    if (this.pointerFrame !== null) {
      cancelAnimationFrame(this.pointerFrame);
      this.pointerFrame = null;
    }

    this.isClearingBrush = false;
    this.hideTooltip();
    // full teardown is ok, the react wrapper will make a fresh d3 instance later
    d3.select(this.el).selectAll('*').remove();
  }
}

export default ScatterplotD3;
