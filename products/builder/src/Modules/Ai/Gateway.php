<?php
/**
 * The Studio agent's gateway to the model (ADR 0039).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Ai;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

/**
 * The agent runs in Auvyx Studio and speaks the provider's own API (OpenAI-compatible chat completions or Anthropic
 * messages). This forwards those requests: it checks the user, sets the configured model and the key the browser never
 * sees, caps the answer's length, and streams the provider's answer back unchanged. Nothing else is interpreted.
 * The agent runs only with the site's own provider key (Settings → AI: provider, key, model); Auvyx Cloud runs no agent
 * (owner's decision, 2026-11-02). EzyPlatform implements the same small contract.
 */
final class Gateway implements Module {

	const ROUTE = '/ai/gateway';

	/** Longest answer one request may ask for (tokens). */
	const MAX_TOKENS = 32000;

	/** Request headers passed on to the provider (the rest — cookies, nonces, the browser's authorization — stay here). */
	const PASS_HEADERS = array( 'anthropic-version', 'anthropic-beta', 'x-session-affinity', 'x-session-id' );

	public function id(): string {
		return 'ai-gateway';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	public function register_rest(): void {
		register_rest_route(
			'auvyx/v1',
			// Anthropic's SDK posts to <base>/v1/messages, OpenAI-compatible ones to <base>/chat/completions.
			self::ROUTE . '/(?P<path>chat/completions|messages|v1/messages)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'forward' ),
				'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
			)
		);
	}

	/** The provider key in clear ('' when none is set). */
	private static function key(): string {
		if ( defined( 'AUVYX_AI_API_KEY' ) && '' !== (string) AUVYX_AI_API_KEY ) {
			return (string) AUVYX_AI_API_KEY;
		}
		$stored = Ai::settings()['key'];
		return '' === $stored ? '' : Ai::decrypt( $stored );
	}

	/** Whether the site has its own AI provider key and a model (Settings → AI, or `AUVYX_AI_API_KEY`): the agent needs both. */
	public static function configured(): bool {
		return '' !== self::key() && '' !== Ai::settings()['model'];
	}

	/**
	 * What Studio needs to reach the model (host-api `AgentEndpoint`): the gateway URL, the provider API and the model's
	 * catalog. The REST nonce authenticates the requests.
	 *
	 * @return array<string, mixed>
	 */
	public static function public_config(): array {
		$s         = Ai::settings();
		$anthropic = 'anthropic' === $s['provider'];
		$base      = strtolower( $s['base_url'] );
		$catalog   = $anthropic ? 'anthropic' : ( false !== strpos( $base, 'openrouter.ai' ) ? 'openrouter' : ( false !== strpos( $base, 'api.openai.com' ) || '' === $base ? 'openai' : 'custom' ) );
		return array(
			'configured'  => self::configured(),
			'settingsUrl' => admin_url( 'admin.php?page=auvyx-builder-settings#auvyx-ai' ),
			'api'         => $anthropic ? 'anthropic-messages' : 'openai-completions',
			'provider'    => $catalog,
			'model'       => $s['model'],
			'baseUrl'     => rest_url( 'auvyx/v1' . self::ROUTE ),
			/** Filters the agent's thinking level: off, low, medium or high. */
			'reasoning'   => (string) apply_filters( 'auvyx_builder_agent_reasoning', 'medium' ),
			'sessions'    => rest_url( 'auvyx/v1' . Sessions::ROUTE ),
		);
	}

	/**
	 * The upstream request for a forwarded body: provider URL, headers and the body with the configured model.
	 *
	 * @param string               $path    "chat/completions" or "messages".
	 * @param array<string, mixed> $body    Request body from Studio.
	 * @param array<string, string> $passed Headers from Studio worth passing on (lower-case names).
	 * @return array{url: string, headers: array<string, string>, body: array<string, mixed>}|\WP_Error
	 */
	public static function upstream( string $path, array $body, array $passed ) {
		$s         = Ai::settings();
		$anthropic = 'anthropic' === $s['provider'];
		if ( ( $anthropic ? 'messages' : 'chat/completions' ) !== $path ) {
			return new \WP_Error( 'auvyx_ai_api', __( 'This site\'s AI provider does not speak that API.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$body['model'] = $s['model'];
		foreach ( array( 'max_tokens', 'max_completion_tokens' ) as $limit ) {
			if ( isset( $body[ $limit ] ) ) {
				$body[ $limit ] = min( (int) $body[ $limit ], self::MAX_TOKENS );
			}
		}
		$headers = array_intersect_key( $passed, array_flip( self::PASS_HEADERS ) );
		if ( $anthropic ) {
			$url                          = 'https://api.anthropic.com/v1/messages';
			$headers['x-api-key']         = self::key();
			$headers['anthropic-version'] = $headers['anthropic-version'] ?? '2023-06-01';
		} else {
			$url                      = untrailingslashit( '' !== $s['base_url'] ? $s['base_url'] : 'https://api.openai.com/v1' ) . '/chat/completions';
			$headers['Authorization'] = 'Bearer ' . self::key();
			$headers['HTTP-Referer']  = home_url( '/' );
			$headers['X-Title']       = 'Auvyx Builder';
		}
		return array(
			'url'     => $url,
			'headers' => $headers,
			'body'    => $body,
		);
	}

	/**
	 * A request body from Studio: its top level as an array (the gateway sets the model and caps), everything inside left as
	 * JSON objects. Decoding all of it to arrays would send an empty object back as `[]` (a tool without parameters, empty
	 * tool arguments), which providers refuse ("input_schema: JSON schema is invalid").
	 *
	 * @param string $raw JSON.
	 * @return array<string, mixed>|null
	 */
	public static function body( string $raw ): ?array {
		$decoded = json_decode( $raw );
		return $decoded instanceof \stdClass ? get_object_vars( $decoded ) : null;
	}

	/**
	 * Forwards one request and streams the provider's answer (status, content type and bytes) as it arrives.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function forward( $request ) {
		if ( ! self::configured() ) {
			return new \WP_Error( 'auvyx_ai_off', __( 'The AI agent needs this site\'s own AI provider key. Add the provider, key and model in Auvyx Builder → Settings → AI.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$body = self::body( (string) $request->get_body() );
		if ( null === $body ) {
			return new \WP_Error( 'auvyx_ai_body', __( 'The request is not JSON.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$passed = array();
		foreach ( self::PASS_HEADERS as $name ) {
			$value = $request->get_header( $name );
			if ( null !== $value && '' !== $value ) {
				$passed[ $name ] = (string) $value;
			}
		}
		$up = self::upstream( (string) preg_replace( '#^v1/#', '', (string) $request['path'] ), $body, $passed );
		if ( is_wp_error( $up ) ) {
			return $up;
		}
		if ( ! function_exists( 'curl_init' ) ) {
			return new \WP_Error( 'auvyx_ai_curl', __( 'The AI agent needs PHP\'s cURL extension to stream answers.', 'auvyx-builder' ), array( 'status' => 501 ) );
		}
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		ignore_user_abort( true );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- not available on every host.
		@set_time_limit( 300 );
		$lines = array( 'Content-Type: application/json' );
		foreach ( $up['headers'] as $name => $value ) {
			$lines[] = $name . ': ' . $value;
		}
		$started = false;
		// phpcs:disable WordPress.WP.AlternativeFunctions -- WordPress' HTTP API cannot stream.
		$ch = curl_init( $up['url'] );
		curl_setopt( $ch, CURLOPT_POST, true );
		curl_setopt( $ch, CURLOPT_HTTPHEADER, $lines );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, wp_json_encode( $up['body'] ) );
		curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 15 );
		curl_setopt( $ch, CURLOPT_TIMEOUT, 300 );
		// Some hosts (WordPress Playground, minimal containers) have no system CA file where cURL looks first
		// ("error setting certificate verify locations: CAfile: /etc/ssl/certs/ca-certificates.crt"): use
		// WordPress' own bundle, which ships with every install.
		$ca = ABSPATH . WPINC . '/certificates/ca-bundle.crt';
		if ( is_readable( $ca ) ) {
			curl_setopt( $ch, CURLOPT_CAINFO, $ca );
		}
		curl_setopt(
			$ch,
			CURLOPT_WRITEFUNCTION,
			static function ( $handle, $chunk ) use ( &$started ) {
				if ( connection_aborted() ) {
					return 0; // Stop, closed tab: stop paying for the answer.
				}
				if ( ! $started ) {
					$started = true;
					status_header( (int) curl_getinfo( $handle, CURLINFO_HTTP_CODE ) );
					$type = (string) curl_getinfo( $handle, CURLINFO_CONTENT_TYPE );
					header( 'Content-Type: ' . ( '' !== $type ? $type : 'text/event-stream' ) );
					header( 'Cache-Control: no-cache, no-transform' );
					header( 'X-Accel-Buffering: no' );
				}
				echo $chunk; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the provider's stream, passed through.
				flush();
				return strlen( $chunk );
			}
		);
		curl_exec( $ch );
		$error = curl_error( $ch );
		curl_close( $ch );
		// phpcs:enable WordPress.WP.AlternativeFunctions
		if ( ! $started ) {
			status_header( 502 );
			header( 'Content-Type: application/json' );
			echo wp_json_encode( array( 'error' => array( 'message' => '' !== $error ? $error : __( 'The AI provider did not answer.', 'auvyx-builder' ) ) ) );
		}
		exit;
	}
}
