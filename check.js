const fetch = require("isomorphic-unfetch");
const { alg, Graph } = require("graphlib");

// const FILENAME = "test"
// const data = require(`./${FILENAME}.json`);
const fs = require("fs").promises;

async function gqlQuery(query, variables = {}) {
  const res = await fetch(`https://hasura.planx.uk/v1/graphql`, {
    method: "POST",
    headers: {
      "X-Hasura-Admin-Secret": process.env.HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors[0].message.includes("x-hasura-admin-secret")) {
    throw Error("Invalid HASURA_SECRET");
  }
  return json;
}

const go = async (id) => {
  const response = await gqlQuery(
    `
    query GetFlow($id: uuid!) {
      flows_by_pk(id: $id) {
        data
      }
    }`,
    { id }
  );
  const { data } = response.data.flows_by_pk;

  console.log("got data...");

  const nodes = Object.entries(data.nodes).reduce((acc, [key, node]) => {
    if (data.edges.some(([src, tgt]) => src === key || tgt === key)) {
      delete node.responses;
      acc[key] = node;
    } else {
      console.error({ removeNode: key });
    }
    return acc;
  }, {});

  console.log("checking edges");

  const edges = data.edges.reduce((acc, [src, tgt]) => {
    if ((src === null || nodes[src]) && nodes[tgt]) {
      acc.push([src, tgt]);
    } else {
      console.error({ removeEdge: [src, tgt] });
    }

    return acc;
  }, []);

  const flow = { edges, nodes };

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

  const cycles = alg.findCycles(graph);

  if (cycles.length > 0) {
    throw console.error(
      JSON.stringify(
        {
          cycles: cycles.map((cycle) =>
            cycle.map((id) => {
              return {
                id,
                ...flow.nodes[id],
                ">": flow.edges
                  .filter(([src]) => src === id)
                  .map(([, tgt]) => tgt)
                  .filter((i) => cycle.includes(i)),
              };
            })
          ),
        },
        null,
        2
      )
    );
  }

  console.log(alg.preorder(graph, ["null"]));

  await fs.writeFile(`./${id}.json`, JSON.stringify(flow, null, 2));
};

go("86d80cbe-04ad-4cec-aaba-4d1833f19033");
