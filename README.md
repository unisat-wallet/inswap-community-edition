# brc20-swap api

## Usage

To use the brc20-swap project, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/brc20-devs/brc20-swap-api.git
   ```

2. Install the project dependencies:

   ```
   yarn
   ```

3. Copy the `config.json.example` file and rename it to `config.json`:

   ```
   cp conf/config.json.example conf/config.json
   ```

4. Configure the OpenAPI API key by updating the `config.json` file with your API key.
   For example:

   ```
   "openApi": {
      "url": "https://open-api.unisat.io",
      "apiKey": "YOUR_API_KEY"
    },
   ```

   Replace `YOUR_API_KEY` with your actual API key.
   Note: If you don't have an API key, you can obtain one by signing up on the OpenAPI website: https://developer.unisat.io

5. Configure the MongoDB connection by updating the `config.json` file with your MongoDB connection details.
   For example:

   ```
   {
     "mongoUrl": "mongodb://127.0.0.1:27017/"
   }
   ```

   Make sure you have MongoDB installed and running on your machine.

   Note: If you don't have MongoDB installed, you can download it from the official MongoDB website: https://www.mongodb.com/download-center/community

6. Start the development server:

   ```
   yarn start-dev
   ```

7. Open your web browser and navigate to `http://localhost:3000/documentation/static/index.html` to access the application.

## Build a new brc20-swap module instance

To build a new brc20-swap module instance, follow these steps:

1. Refer to the `script/deploy-on-testnet-example.ts` file for an example of how to deploy a new module and contract.
2. Once you have the new module and contract, update the corresponding configuration in the `config.json` file.

## Contributing

If you would like to contribute to this project, please follow these guidelines:

1. Fork the repository on GitHub.

2. Create a new branch for your feature or bug fix.

3. Make your changes and commit them with descriptive messages.

4. Push your branch to your forked repository.

5. Submit a pull request to the main repository.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
