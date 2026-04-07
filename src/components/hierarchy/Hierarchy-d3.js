import * as d3 from 'd3';
import { formatMetric } from '../../utils/formatting';

const RISK_COLORMAP = (value) => d3.interpolateRdYlGn(0.08 + (1 - value) * 0.84);

const STATE_ABBREVIATION_BY_NAME = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Idaho: 'ID',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
};

class HierarchyD3 {
  margin = { top: 12, right: 12, bottom: 12, left: 12 };
  transitionDuration = 250;
  colorScale = d3.scaleSequential(RISK_COLORMAP)
    .domain([0, 1])
    .clamp(true);

  constructor(el) {
    this.el = el;
    this.lastInteractionSignature = '';
  }

  create(config) {
    this.size = {
      width: config.size.width ?? 700,
      height: config.size.height ?? 720,
    };
    this.width = this.size.width - this.margin.left - this.margin.right;
    this.height = this.size.height - this.margin.top - this.margin.bottom;

    // hierarchy stays svg-only, node count is still ok for that
    this.rootSelection = d3.select(this.el)
      .style('position', 'relative');

    this.svg = this.rootSelection
      .append('svg')
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    this.chartG = this.svg.append('g')
      .attr('class', 'hierarchyChart');

    this.tooltip = this.rootSelection
      .append('div')
      .attr('class', 'chartTooltip hierarchyTooltip');
  }

  buildHierarchy(visData) {
    // turn the flat table into the 2-level tree the layouts expect: state -> community
    const states = d3.groups(visData, (item) => item.stateName)
      .map(([stateName, items]) => ({
        name: stateName,
        type: 'state',
        children: items.map((item) => ({
          name: item.communityLabel,
          type: 'community',
          item,
        })),
      }))
      .sort((a, b) => d3.descending(a.children.length, b.children.length));

    const root = d3.hierarchy({ name: 'Communities', children: states })
      .sum((node) => (node.type === 'community' ? Math.max(node.item.population ?? 0, 0.01) : 0))
      .sort((a, b) => d3.descending(a.value, b.value));

    return this.decorateHierarchy(root);
  }

  decorateHierarchy(root) {
    root.each((node) => {
      const descendantLeaves = node.leaves();
      // cache these once, hover/select would be more expencive if we recompute every time
      node.items = descendantLeaves
        .map((leaf) => leaf.data.item)
        .filter((item) => item !== undefined);
      node.itemIndexes = node.items.map((item) => item.index);
      node.itemIndexSet = new Set(node.itemIndexes);
      node.meanCrime = d3.mean(node.items, (item) => item.ViolentCrimesPerPop);
      node.meanIncome = d3.mean(node.items, (item) => item.medIncome);
    });

    return root;
  }

  getNodeTitle(node) {
    // native title is still useful when labels get too cramped to show details
    const label = node.depth === 1 ? node.data.name : `${node.data.name}, ${node.parent.data.name}`;
    return `${label}
Population score: ${formatMetric(node.value)}
Mean violent crime rate: ${formatMetric(node.meanCrime)}
Mean median income: ${formatMetric(node.meanIncome)}`;
  }

  truncateLabel(label, maxChars) {
    if (maxChars <= 0) {
      return '';
    }

    if (label.length <= maxChars) {
      return label;
    }

    if (maxChars <= 4) {
      return '';
    }

    return `${label.slice(0, maxChars - 1)}…`;
  }

  getShortStateLabel(stateName, availableWidth) {
    const abbreviation = STATE_ABBREVIATION_BY_NAME[stateName] ?? stateName.slice(0, 2).toUpperCase();

    if (availableWidth < 14) {
      return '';
    }

    if (availableWidth < 54) {
      return abbreviation;
    }

    const estimatedChars = Math.floor((availableWidth - 12) / 7);
    if (estimatedChars < 10) {
      return abbreviation;
    }

    if (estimatedChars >= stateName.length) {
      return stateName;
    }

    return this.truncateLabel(stateName, estimatedChars);
  }

  getStateAbbreviation(stateName) {
    return STATE_ABBREVIATION_BY_NAME[stateName] ?? stateName.slice(0, 2).toUpperCase();
  }

  getPartitionLabelConfig(node) {
    const width = node.x1 - node.x0;
    const abbreviation = this.getStateAbbreviation(node.data.name);

    // partition gets tiny very fast, so short labels are more honest here
    if (width >= 12) {
      return {
        text: abbreviation,
        x: node.x0 + 2,
        y: node.y0 + 11,
        transform: null,
        anchor: 'start',
      };
    }

    return null;
  }

  getLeafLabel(node) {
    const width = node.x1 - node.x0;
    const height = node.y1 - node.y0;

    // small leaves become messy very quick, blank is better than fake readability
    if (width < 120 || height < 38) {
      return '';
    }

    const maxChars = Math.floor((width - 12) / 6.8);
    return this.truncateLabel(node.data.name, Math.min(maxChars, 15));
  }

  showTooltip(event, node) {
    if (!this.tooltip) {
      return;
    }

    // state nodes use aggregated values, leaf nodes use the original row values
    const isState = node.depth === 1;
    const populationValue = isState ? node.value : node.data.item.population;
    const crimeValue = isState ? node.meanCrime : node.data.item.ViolentCrimesPerPop;
    const incomeValue = isState ? node.meanIncome : node.data.item.medIncome;

    this.tooltip
      .html(`
        <div class="tooltipEyebrow">${isState ? 'State aggregate' : 'Community'}</div>
        <div class="tooltipTitle">${node.data.name}</div>
        <div class="tooltipMeta">${isState ? `${node.items.length} communities` : node.parent.data.name}</div>
        <div class="tooltipGrid">
          <div class="tooltipStat">
            <span>Population</span>
            <strong>${formatMetric(populationValue)}</strong>
          </div>
          <div class="tooltipStat">
            <span>Violent crime rate</span>
            <strong>${formatMetric(crimeValue)}</strong>
          </div>
          <div class="tooltipStat">
            <span>Median income</span>
            <strong>${formatMetric(incomeValue)}</strong>
          </div>
          <div class="tooltipStat">
            <span>Level</span>
            <strong>${isState ? 'Aggregated state' : 'Community node'}</strong>
          </div>
        </div>
      `)
      .classed('is-visible', true);

    const rootRect = this.rootSelection.node().getBoundingClientRect();
    const tooltipNode = this.tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth || 220;
    const tooltipHeight = tooltipNode.offsetHeight || 120;
    const localX = event.clientX - rootRect.left;
    const localY = event.clientY - rootRect.top;
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
    if (this.tooltip) {
      this.tooltip.classed('is-visible', false);
    }
  }

  bindNodeEvents(selection) {
    selection
      .on('mouseenter', (event, node) => {
        // every node writes into the same shared state, thats how linked views stay in sync
        this.controllerMethods.handleOnMouseEnter(node.items);
        this.showTooltip(event, node);
      })
      .on('mousemove', (event, node) => {
        this.showTooltip(event, node);
      })
      .on('mouseleave', () => {
        this.controllerMethods.handleOnMouseLeave();
        this.hideTooltip();
      })
      .on('click', (event, node) => {
        this.controllerMethods.handleOnClick(node.items);
      });
  }

  renderTreemap(root) {
    const layoutRoot = this.decorateHierarchy(root.copy());
    d3.treemap()
      .size([this.width, this.height])
      .paddingOuter(6)
      .paddingInner(1.35)
      .paddingTop((node) => (node.depth === 1 ? 18 : 0))(layoutRoot);

    const states = layoutRoot.children ?? [];
    const leaves = layoutRoot.leaves();

    // layout switches are small enough that a full rebuild is simpler then diffing all 3 modes
    this.chartG.selectAll('*').remove();

    this.leafSelection = this.chartG.selectAll('.treemapLeaf')
      .data(leaves, (node) => node.data.item.index)
      .join(
        (enter) => {
          const leaf = enter.append('g')
            .attr('class', 'treemapLeaf nodeGroup')
            .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

          leaf.append('rect')
            .attr('class', 'node-shape leaf-shape')
            .attr('rx', 1.2)
            .attr('ry', 1.2)
            .attr('stroke', '#eef2f6')
            .attr('stroke-width', 0.5);

          leaf.append('text')
            .attr('class', 'leafLabel');

          leaf.append('title');
          this.bindNodeEvents(leaf);
          return leaf;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    this.leafSelection
      .transition()
      .duration(this.transitionDuration)
      .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

    this.leafSelection.select('.node-shape')
      .attr('width', (node) => Math.max(node.x1 - node.x0, 0))
      .attr('height', (node) => Math.max(node.y1 - node.y0, 0))
      .attr('fill', (node) => this.colorScale(node.meanCrime));

    this.leafSelection.select('.leafLabel')
      .attr('x', 5)
      .attr('y', 15)
      .text((node) => this.getLeafLabel(node));

    this.leafSelection.select('title')
      .text((node) => this.getNodeTitle(node));

    this.stateSelection = this.chartG.selectAll('.treemapState')
      .data(states, (node) => node.data.name)
      .join(
        (enter) => {
          const state = enter.append('g')
            .attr('class', 'treemapState nodeGroup')
            .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

          state.append('rect')
            .attr('class', 'node-shape stateOutline')
            .attr('fill', 'none');

          state.append('text')
            .attr('class', 'stateLabel')
            .attr('x', 4)
            .attr('y', 12);

          state.append('title');
          this.bindNodeEvents(state);
          return state;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    this.stateSelection
      .transition()
      .duration(this.transitionDuration)
      .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

    this.stateSelection.select('.stateOutline')
      .attr('width', (node) => Math.max(node.x1 - node.x0, 0))
      .attr('height', (node) => Math.max(node.y1 - node.y0, 0));

    this.stateSelection.select('.stateLabel')
      .text((node) => this.getShortStateLabel(node.data.name, node.x1 - node.x0));

    this.stateSelection.select('title')
      .text((node) => this.getNodeTitle(node));
  }

  renderPack(root) {
    const layoutRoot = d3.pack()
      .size([this.width, this.height])
      .padding(6)(this.decorateHierarchy(root.copy()));

    const nodes = layoutRoot.descendants().filter((node) => node.depth > 0);
    const states = layoutRoot.children ?? [];

    this.chartG.selectAll('*').remove();

    this.nodeSelection = this.chartG.selectAll('.packNode')
      .data(nodes, (node) => (node.depth === 2 ? node.data.item.index : node.data.name))
      .join(
        (enter) => {
          const group = enter.append('g')
            .attr('class', 'packNode nodeGroup')
            .attr('transform', (node) => `translate(${node.x},${node.y})`);

          group.append('circle')
            .attr('class', 'node-shape');

          group.append('text')
            .attr('class', 'packLabel')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em');

          group.append('title');
          this.bindNodeEvents(group);
          return group;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    this.nodeSelection
      .transition()
      .duration(this.transitionDuration)
      .attr('transform', (node) => `translate(${node.x},${node.y})`);

    this.nodeSelection.select('.node-shape')
      .attr('r', (node) => node.r)
      .attr('fill', (node) => this.colorScale(node.meanCrime))
      .attr('stroke', '#eef2f6')
      .attr('stroke-width', 0.5);

    this.nodeSelection.select('.packLabel')
      .text((node) => {
        return node.depth === 2 && node.r > 18 ? node.data.name : '';
      });

    this.nodeSelection.select('title')
      .text((node) => this.getNodeTitle(node));

    // keep state labels on a top text layer, or child circles hide them too easly
    this.packStateLabelSelection = this.chartG.selectAll('.packStateLabelOverlay')
      .data(states, (node) => node.data.name)
      .join('text')
      .attr('class', 'packStateLabelOverlay')
      .attr('text-anchor', 'middle')
      .attr('x', (node) => node.x)
      .attr('y', (node) => node.y)
      .attr('dy', '0.35em')
      .text((node) => this.getShortStateLabel(node.data.name, node.r * 2));

    this.stateSelection = this.nodeSelection.filter((node) => node.depth === 1);
    this.leafSelection = this.nodeSelection.filter((node) => node.depth === 2);
  }

  renderPartition(root) {
    const layoutRoot = d3.partition()
      .size([this.width, this.height])(this.decorateHierarchy(root.copy()));

    const nodes = layoutRoot.descendants().filter((node) => node.depth > 0);
    const states = layoutRoot.children ?? [];

    this.chartG.selectAll('*').remove();

    this.nodeSelection = this.chartG.selectAll('.partitionNode')
      .data(nodes, (node) => (node.depth === 2 ? node.data.item.index : node.data.name))
      .join(
        (enter) => {
          const group = enter.append('g')
            .attr('class', 'partitionNode nodeGroup')
            .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

          group.append('rect')
            .attr('class', 'node-shape')
            .attr('rx', 2)
            .attr('ry', 2);

          group.append('text')
            .attr('class', 'partitionLabel')
            .attr('x', 6)
            .attr('y', 16);

          group.append('title');
          this.bindNodeEvents(group);
          return group;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    this.nodeSelection
      .transition()
      .duration(this.transitionDuration)
      .attr('transform', (node) => `translate(${node.x0},${node.y0})`);

    this.nodeSelection.select('.node-shape')
      .attr('width', (node) => Math.max(node.x1 - node.x0, 0))
      .attr('height', (node) => Math.max(node.y1 - node.y0, 0))
      .attr('fill', (node) => this.colorScale(node.meanCrime))
      .attr('stroke', '#eef2f6')
      .attr('stroke-width', 0.5);

    this.nodeSelection.select('.partitionLabel')
      .text((node) => {
        return node.depth === 2 && node.x1 - node.x0 > 75 ? node.data.name : '';
      });

    this.nodeSelection.select('title')
      .text((node) => this.getNodeTitle(node));

    // all states use top abbrevs now, full names looked inconsistent on narrow bars
    this.partitionStateLabelSelection = this.chartG.selectAll('.partitionStateLabelOverlay')
      .data(states, (node) => node.data.name)
      .join('text')
      .attr('class', 'partitionStateLabelOverlay')
      .attr('text-anchor', (node) => this.getPartitionLabelConfig(node)?.anchor ?? 'start')
      .attr('x', (node) => this.getPartitionLabelConfig(node)?.x ?? node.x0)
      .attr('y', (node) => this.getPartitionLabelConfig(node)?.y ?? node.y0)
      .attr('transform', (node) => this.getPartitionLabelConfig(node)?.transform ?? null)
      .text((node) => this.getPartitionLabelConfig(node)?.text ?? '');

    this.stateSelection = this.nodeSelection.filter((node) => node.depth === 1);
    this.leafSelection = this.nodeSelection.filter((node) => node.depth === 2);
  }

  renderHierarchy(visData, layoutMode, controllerMethods) {
    this.controllerMethods = controllerMethods;
    this.layoutMode = layoutMode;

    if (visData.length === 0) {
      this.chartG.selectAll('*').remove();
      this.leafSelection = null;
      this.stateSelection = null;
      this.hideTooltip();
      return;
    }

    this.root = this.buildHierarchy(visData);
    this.lastInteractionSignature = '';

    // only one layout is live at once, branching here is easier then over-abstracting
    if (layoutMode === 'pack') {
      this.renderPack(this.root);
      return;
    }

    if (layoutMode === 'partition') {
      this.renderPartition(this.root);
      return;
    }

    this.renderTreemap(this.root);
  }

  getNodeOpacity(node, selectedIndexes, hoveredIndexes) {
    const hasHoverMatch = this.hasInteractionMatch(node, hoveredIndexes);
    const hasSelectionMatch = this.hasInteractionMatch(node, selectedIndexes);

    if (hoveredIndexes.size > 0) {
      if (hasHoverMatch) {
        return 1;
      }

      return selectedIndexes.size > 0 && !hasSelectionMatch ? 0.1 : 0.24;
    }

    if (selectedIndexes.size > 0) {
      return hasSelectionMatch ? 1 : 0.1;
    }

    return 1;
  }

  getNodeBorderState(node, selectedIndexes, hoveredIndexes, defaultStroke) {
    const hasHoverMatch = this.hasInteractionMatch(node, hoveredIndexes);
    const hasSelectionMatch = this.hasInteractionMatch(node, selectedIndexes);

    if (hasHoverMatch) {
      return { stroke: '#41515d', strokeWidth: 0.66 };
    }

    if (hasSelectionMatch) {
      return { stroke: '#5b6d7b', strokeWidth: 0.58 };
    }

    return { stroke: defaultStroke, strokeWidth: defaultStroke === '#eef2f6' ? 0.5 : 0.6 };
  }

  syncNodeSelection(selection, selectedIndexes, hoveredIndexes, defaultStroke) {
    if (!selection) {
      return;
    }

    // keep this very direct, animated syncing felt sluggish in practice
    selection
      .interrupt()
      .style('opacity', (node) => this.getNodeOpacity(node, selectedIndexes, hoveredIndexes));

    selection.select('.node-shape')
      .interrupt()
      .each((node, index, nodes) => {
        const borderState = this.getNodeBorderState(node, selectedIndexes, hoveredIndexes, defaultStroke);
        d3.select(nodes[index])
          .attr('stroke', borderState.stroke)
          .attr('stroke-width', borderState.strokeWidth);
      });
  }

  hasInteractionMatch(node, interactionIndexes) {
    if (!interactionIndexes || interactionIndexes.size === 0) {
      return false;
    }

    // itemIndexSet was cached earlier, so this test stays pretty light
    for (const index of interactionIndexes) {
      if (node.itemIndexSet.has(index)) {
        return true;
      }
    }

    return false;
  }

  getInteractionSignature(selectedItems, hoveredItems) {
    return `${selectedItems.map((item) => item.index).join(',')}|${hoveredItems.map((item) => item.index).join(',')}`;
  }

  syncInteractionState(selectedItems, hoveredItems) {
    const nextSignature = this.getInteractionSignature(selectedItems, hoveredItems);
    // same interaction state again, no reason to restyle the whole hierarchy
    if (nextSignature === this.lastInteractionSignature) {
      return;
    }

    this.lastInteractionSignature = nextSignature;
    const selectedIndexes = new Set(selectedItems.map((item) => item.index));
    const hoveredIndexes = new Set(hoveredItems.map((item) => item.index));

    this.syncNodeSelection(this.leafSelection, selectedIndexes, hoveredIndexes, '#eef2f6');
    this.syncNodeSelection(this.stateSelection, selectedIndexes, hoveredIndexes, '#d1d8df');
  }

  clear() {
    this.hideTooltip();
    d3.select(this.el).selectAll('*').remove();
  }
}

export default HierarchyD3;
