const FILENAME = "findoutifyouneedplanningpermission"

const { alg, Graph } = require("graphlib");
const fs = require("fs")
const data = require(`./${FILENAME}.json`);

console.log("checking nodes");

const nodes = Object.entries(data.nodes).reduce((acc, [key, node]) => {
  if (data.edges.some(([src,tgt]) => src === key || tgt === key)) {
    delete node.responses;
    acc[key] = node;
  } else {
    console.error({removeNode: key})
  }
  return acc;
}, {})

// console.log(nodes)

console.log("checking edges")

const edges = data.edges.reduce((acc, [src,tgt]) => {

    if ((src === null || nodes[src]) && nodes[tgt]) {
      acc.push([src,tgt])
    } else {
      console.error({removeEdge: [src,tgt]})
    }

  return acc;
}, [])

const flow = {edges, nodes}

const toGraphlib = (flow) => {
  // create a graph with the existing nodes and edges
  const g = new Graph({ directed: true, multigraph: false });
  Object.keys(flow.nodes).forEach((key) => {
    g.setNode(key);
  });
  flow.edges.forEach(([src, tgt]) => {
    g.setEdge(src, tgt);
  });
  return g;
};

const graph = toGraphlib(flow);

if (!alg.isAcyclic(graph)) {
  throw "cycle in graph"
}

console.log(alg.preorder(graph, ['null']))

fs.writeFile(`./${FILENAME}.fixed.json`, JSON.stringify(flow, null,2), (err) => {
  if (err) throw err;
  // console.log('done')
})
